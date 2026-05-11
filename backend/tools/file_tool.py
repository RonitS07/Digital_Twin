import os
import io
try:
    import PyPDF2
except ImportError:
    pass

try:
    import docx
except ImportError:
    pass

def read_file(file_path: str) -> str:
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")
    
    ext = os.path.splitext(file_path)[1].lower()
    text = ""
    
    if ext in [".txt", ".md", ".json", ".csv"]:
        with open(file_path, "r", encoding="utf-8") as f:
            text = f.read()
    elif ext == ".pdf":
        try:
            with open(file_path, "rb") as f:
                reader = PyPDF2.PdfReader(f)
                for page in reader.pages:
                    text += page.extract_text() + "\n"
        except Exception as e:
            raise RuntimeError(f"Error reading PDF: {e}")
    elif ext == ".docx":
        try:
            doc = docx.Document(file_path)
            text = "\n".join([para.text for para in doc.paragraphs])
        except Exception as e:
            raise RuntimeError(f"Error reading DOCX: {e}")
    else:
        # Fallback to reading as text
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            text = f.read()
            
    return text[:3000]

def read_image_description(image_path: str) -> str:
    # Just returning a placeholder or basic metadata for now as requested
    if image_path.startswith("http"):
        import requests
        try:
            res = requests.get(image_path, timeout=10)
            res.raise_for_status()
            size = len(res.content)
            return f"Downloaded image from {image_path} (Size: {size} bytes). No vision model configured to describe it."
        except Exception as e:
            return f"Failed to download image from URL: {e}"
    
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Image not found: {image_path}")
        
    size = os.path.getsize(image_path)
    return f"Image file: {os.path.basename(image_path)} (Size: {size} bytes). No vision model configured to describe it."
