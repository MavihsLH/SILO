"""
Layout-Aware PDF Parser (2-Column & Table-Preserving)
=====================================================
Drop-in LlamaIndex BaseReader replacement for PyMuPDFReader.

Fixes two classic RAG failure modes on dense financial 10-Ks and academic PDFs:
1. Side-by-side 2-column layouts / tables merging onto the same horizontal line.
2. Flattened multi-column tables (e.g., LaTeX booktabs without vertical borders)
   causing local LLMs to misalign columns and hallucinate adjacent numbers.
3. Table title / unit scale headers (e.g., "(In millions)") getting separated
   from bottom table rows across chunk boundaries.
"""

import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import fitz
from llama_index.core.readers.base import BaseReader
from llama_index.core.schema import Document


_NUMERIC_TOKEN_RE = re.compile(r"^[\$\(\-\+~]?\d[\d,\.\*†/%]*\)?$|^-$|^—$")
_TABLE_HINT_RE = re.compile(
    r"(in millions|in thousands|in billions|table\s+\d+|consolidated\s+statements|consolidated\s+balance|segment\s+information)",
    re.IGNORECASE,
)


def _is_tabular_line(line_words: List[Tuple]) -> bool:
    """Detect whether a visual line looks like a table row or compact column header."""
    if len(line_words) < 3:
        return False
    tokens = [w[4] for w in line_words]
    numeric_cnt = sum(1 for t in tokens if _NUMERIC_TOKEN_RE.match(t))
    if numeric_cnt >= 2:
        return True
    # Also detect table headers with multiple wide horizontal gaps
    wide_gaps = sum(
        1 for prev, curr in zip(line_words, line_words[1:]) if (curr[0] - prev[2]) > 8.5
    )
    return wide_gaps >= 2


def _format_words_region(words: List[Tuple]) -> str:
    """Reconstruct text lines from PyMuPDF word tuples, inserting ` | ` at table column gaps."""
    if not words:
        return ""

    # Sort roughly top-to-bottom then left-to-right
    words_sorted = sorted(words, key=lambda w: ((w[1] + w[3]) / 2.0, w[0]))
    lines: List[List[Tuple]] = []
    cur_line = [words_sorted[0]]
    cur_y = (words_sorted[0][1] + words_sorted[0][3]) / 2.0

    for w in words_sorted[1:]:
        yc = (w[1] + w[3]) / 2.0
        if abs(yc - cur_y) <= 3.5:
            cur_line.append(w)
        else:
            lines.append(sorted(cur_line, key=lambda x: x[0]))
            cur_line = [w]
            cur_y = yc
    lines.append(sorted(cur_line, key=lambda x: x[0]))

    out_lines: List[str] = []
    for ln in lines:
        tabular = _is_tabular_line(ln)
        # Use a tighter column delimiter threshold on tabular rows so closely spaced
        # numeric columns (e.g., SQuAD Dev/Test EM/F1 or NQ/TQA) stay cleanly separated.
        gap_threshold = 5.5 if tabular else 11.0
        parts = [ln[0][4]]
        for prev, curr in zip(ln, ln[1:]):
            gap = curr[0] - prev[2]
            if gap > gap_threshold:
                parts.append(" | ")
            else:
                parts.append(" ")
            parts.append(curr[4])
        out_lines.append("".join(parts))

    return "\n".join(out_lines)


def _extract_page_layout_aware(page: fitz.Page) -> str:
    """
    Extract text from a PDF page preserving 2-column reading order and pipe-delimited tables.
    """
    pw = page.rect.width
    mid = pw / 2.0
    blocks = page.get_text("blocks")  # (x0, y0, x1, y1, text, block_no, block_type)
    text_blocks = [b for b in blocks if b[6] == 0 and b[4].strip()]
    words = page.get_text("words")  # (x0, y0, x1, y1, word, block_no, line_no, word_no)

    if not words:
        return page.get_text("text")

    # Detect two-column academic pages: significant distinct left and right blocks
    left_blocks = [b for b in text_blocks if b[2] <= mid + 12]
    right_blocks = [b for b in text_blocks if b[0] >= mid - 12]
    is_two_col = len(left_blocks) >= 2 and len(right_blocks) >= 2

    if not is_two_col:
        return _format_words_region(words)

    # Full-width blocks act as vertical band dividers (e.g., page-spanning tables/figures/titles)
    full_blocks = [b for b in text_blocks if b[0] < mid - 12 and b[2] > mid + 12]
    full_blocks.sort(key=lambda b: b[1])

    def _word_in_block(w: Tuple, b: Tuple) -> bool:
        xc, yc = (w[0] + w[2]) / 2.0, (w[1] + w[3]) / 2.0
        return b[0] - 2 <= xc <= b[2] + 2 and b[1] - 2 <= yc <= b[3] + 2

    sections: List[str] = []
    y_cursor = -1e9

    for fb in full_blocks:
        band_words = [w for w in words if y_cursor <= (w[1] + w[3]) / 2.0 < fb[1] - 1]
        if band_words:
            lw = [w for w in band_words if (w[0] + w[2]) / 2.0 < mid]
            rw = [w for w in band_words if (w[0] + w[2]) / 2.0 >= mid]
            if lw:
                sections.append(_format_words_region(lw))
            if rw:
                sections.append(_format_words_region(rw))
        fw = [w for w in words if _word_in_block(w, fb)]
        if fw:
            sections.append(_format_words_region(fw))
        y_cursor = fb[3] + 1

    rem_words = [w for w in words if (w[1] + w[3]) / 2.0 >= y_cursor]
    if rem_words:
        lw = [w for w in rem_words if (w[0] + w[2]) / 2.0 < mid]
        rw = [w for w in rem_words if (w[0] + w[2]) / 2.0 >= mid]
        if lw:
            sections.append(_format_words_region(lw))
        if rw:
            sections.append(_format_words_region(rw))

    return "\n\n".join(s for s in sections if s.strip())


def extract_page_header_hint(page_text: str) -> Optional[str]:
    """
    Extract a concise statement/unit header from the top of a page (e.g., financial
    statement title + '(In millions)') so split chunks retain exact scale/units.
    """
    head_lines = [ln.strip() for ln in page_text.splitlines()[:8] if ln.strip()]
    # Filter out generic boilerplate like 'Table of Contents'
    filtered = [ln for ln in head_lines if ln.lower() != "table of contents"]
    if not filtered:
        return None
    joined = " | ".join(filtered[:4])
    if _TABLE_HINT_RE.search(joined):
        return joined[:220]
    return None


class LayoutAwarePDFReader(BaseReader):
    """LlamaIndex-compatible PDF reader with 2-column & table-layout preservation."""

    def load_data(self, file: Path, extra_info: Optional[Dict] = None) -> List[Document]:
        file_path = Path(file)
        docs: List[Document] = []

        with fitz.open(str(file_path)) as pdf:
            total_pages = len(pdf)
            for page_idx in range(total_pages):
                page = pdf[page_idx]
                page_num = page_idx + 1
                text = _extract_page_layout_aware(page)
                if not text or not text.strip():
                    continue

                header_hint = extract_page_header_hint(text)
                metadata = {
                    "total_pages": total_pages,
                    "file_path": str(file_path),
                    "file_name": file_path.name,
                    "source": str(page_num),
                }
                if header_hint:
                    metadata["page_header"] = header_hint
                if extra_info:
                    metadata.update(extra_info)

                docs.append(Document(text=text, metadata=metadata))

        return docs
