import os
import logging

logger = logging.getLogger(__name__)


def read_file(file_path: str) -> str:
    """
    Read text content from an uploaded file.
    Supports: .txt .md .json .csv .pdf .docx and any plain text fallback.
    Returns first 3000 chars + char count.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    ext = os.path.splitext(file_path)[1].lower()

    # BUG 1 FIX: Handle image files without trying to read binary as text
    IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tiff', '.ico'}
    if ext in IMAGE_EXTENSIONS:
        size = os.path.getsize(file_path)
        return (
            f"[Image file: {os.path.basename(file_path)}, size: {size} bytes. "
            f"This is a {ext[1:].upper()} image file. "
            f"To analyze this image, please describe what you'd like to know about it.]"
        )

    text = ""

    if ext in (".txt", ".md", ".json", ".csv"):
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            text = f.read()

    elif ext == ".pdf":
        try:
            import pdfplumber
            with pdfplumber.open(file_path) as pdf:
                text = "\n".join(
                    page.extract_text() or "" for page in pdf.pages
                )
        except ImportError:
            # Fallback to PyPDF2 if pdfplumber not installed
            try:
                import PyPDF2  # type: ignore
                with open(file_path, "rb") as f:
                    reader = PyPDF2.PdfReader(f)
                    for page in reader.pages:
                        text += (page.extract_text() or "") + "\n"
            except Exception as e:
                raise RuntimeError(f"Error reading PDF: {e}")
        except Exception as e:
            raise RuntimeError(f"Error reading PDF: {e}")

    elif ext == ".docx":
        try:
            from docx import Document  # type: ignore
            doc = Document(file_path)
            text = "\n".join(p.text for p in doc.paragraphs)
        except Exception as e:
            raise RuntimeError(f"Error reading DOCX: {e}")

    else:
        # Generic fallback — read as plain text
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            text = f.read()

    total_chars = len(text)
    snippet = text[:3000]
    if total_chars > 3000:
        snippet += f"\n\n[...{total_chars - 3000} more characters truncated...]"
    return snippet


def read_image_description(image_path: str) -> str:
    """Return basic metadata; real vision model integration can be added here."""
    if image_path.startswith("http://") or image_path.startswith("https://"):
        try:
            import requests  # type: ignore
            res = requests.get(image_path, timeout=10)
            res.raise_for_status()
            size = len(res.content)
            return (
                f"Downloaded image from {image_path} "
                f"(Size: {size} bytes). No vision model configured."
            )
        except Exception as e:
            return f"Failed to download image from URL: {e}"

    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Image not found: {image_path}")

    size = os.path.getsize(image_path)
    return (
        f"Image file: {os.path.basename(image_path)} "
        f"(Size: {size} bytes). No vision model configured."
    )
