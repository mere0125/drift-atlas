from pathlib import Path

from reportlab.lib.colors import Color, HexColor
from reportlab.lib.pagesizes import letter
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "Drift_Atlas_Peer_User_Test_Mere_Cui.pdf"

INK = HexColor("#0A2840")
PAPER = HexColor("#EEE8D8")
AQUA = HexColor("#6EC8C4")
RUST = HexColor("#C95338")
SOFT = Color(10 / 255, 40 / 255, 64 / 255, alpha=0.55)


def wrapped_lines(text, font, size, max_width):
    words = text.split()
    lines = []
    current = ""
    for word in words:
        trial = f"{current} {word}".strip()
        if stringWidth(trial, font, size) <= max_width:
            current = trial
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def draw_wrapped(pdf, text, x, y, max_width, font="Helvetica", size=10, leading=14, color=INK):
    pdf.setFillColor(color)
    pdf.setFont(font, size)
    for line in wrapped_lines(text, font, size, max_width):
        pdf.drawString(x, y, line)
        y -= leading
    return y


def build():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    pdf = canvas.Canvas(str(OUTPUT), pagesize=letter)
    width, height = letter
    pdf.setTitle("Drift Atlas - Peer User Test")
    pdf.setAuthor("Mere Cui")

    pdf.setFillColor(PAPER)
    pdf.rect(0, 0, width, height, fill=1, stroke=0)
    pdf.setFillColor(INK)
    pdf.rect(0, height - 11, width, 11, fill=1, stroke=0)
    pdf.setFillColor(AQUA)
    pdf.circle(width - 65, height - 74, 22, fill=1, stroke=0)
    pdf.setStrokeColor(INK)
    pdf.setLineWidth(0.6)
    pdf.line(42, height - 148, width - 42, height - 148)

    pdf.setFillColor(INK)
    pdf.setFont("Times-Roman", 47)
    pdf.drawString(42, height - 72, "Drift Atlas")
    pdf.setFont("Helvetica", 8.5)
    pdf.drawString(43, height - 94, "PEER USER TEST - NOVEMBER 5, 2026")

    meta_x = 355
    meta_y = height - 47
    pdf.setFont("Helvetica-Bold", 8.5)
    pdf.drawString(meta_x, meta_y, "Mere Cui")
    pdf.setFont("Helvetica", 8.5)
    pdf.drawString(meta_x, meta_y - 16, "cuis308@newschool.edu")
    url = "https://mere0125.github.io/drift-atlas/"
    pdf.setFillColor(RUST)
    pdf.drawString(meta_x, meta_y - 32, "mere0125.github.io/drift-atlas")
    pdf.linkURL(url, (meta_x, meta_y - 35, width - 42, meta_y - 22), relative=0)

    purpose = (
        "Drift Atlas is a place-based way to explore historical NOAA surface-drifter observations. "
        "It lets a visitor find instruments that passed near a chosen point in 2024, then follow one "
        "visible regional record before and after that encounter."
    )
    y = draw_wrapped(pdf, purpose, 42, height - 184, width - 84, "Times-Roman", 15.5, 21, INK)

    pdf.setFont("Times-Roman", 25)
    pdf.setFillColor(INK)
    pdf.drawString(42, y - 25, "Four things to try")
    y -= 62

    tasks = [
        "Before using the controls, explain whether the website is showing live ocean movement, a forecast, or historical observations.",
        "Choose a location, month, and search radius different from the opening example. How many drifters does the archive return?",
        "Open one result and follow its 2024 record. When did it come near your selected place, and what general direction did it travel afterward?",
        "Find one warning about the limits of the data. What should you avoid concluding from a single route or an empty search?",
    ]

    for number, task in enumerate(tasks, start=1):
        pdf.setStrokeColor(Color(10 / 255, 40 / 255, 64 / 255, alpha=0.25))
        pdf.line(42, y + 10, width - 42, y + 10)
        pdf.setFillColor(RUST)
        pdf.setFont("Helvetica", 8.5)
        pdf.drawString(43, y - 6, f"0{number}")
        y = draw_wrapped(pdf, task, 83, y - 5, width - 125, "Times-Roman", 11.5, 15.2, INK) - 15

    pdf.setFillColor(Color(110 / 255, 200 / 255, 196 / 255, alpha=0.18))
    pdf.roundRect(42, 38, width - 84, 51, 2, fill=1, stroke=0)
    note = "Please note where you hesitate, what you expected to happen, and any label that did not make sense. The test is about the project, not the tester."
    draw_wrapped(pdf, note, 55, 70, width - 110, "Helvetica", 8.7, 12, INK)

    pdf.save()
    print(OUTPUT)


if __name__ == "__main__":
    build()
