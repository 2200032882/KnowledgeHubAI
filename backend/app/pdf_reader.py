import io

import fitz
import pytesseract

from PIL import Image


def extract_text_from_pdf(
    pdf_path: str
) -> str:

    pdf = fitz.open(
        pdf_path
    )

    full_text = []

    for page in pdf:

        text = page.get_text()

        if text.strip():

            full_text.append(
                text
            )

        else:

            pix = page.get_pixmap()

            image = Image.open(
                io.BytesIO(
                    pix.tobytes("png")
                )
            )

            ocr_text = (
                pytesseract
                .image_to_string(image)
            )

            full_text.append(
                ocr_text
            )

    pdf.close()

    return "\n".join(
        full_text
    )