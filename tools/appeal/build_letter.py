# -*- coding: utf-8 -*-
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.units import inch
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_JUSTIFY, TA_LEFT
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer,
                                HRFlowable, KeepTogether)

OUT = "/tmp/claude-0/-home-user-StaceCentral/a251d0f1-4c8a-560d-85c5-4a48b59404ea/scratchpad/appeal/Stacey-Doret-Appeal-Corrective-Action-2026-09-08.pdf"

FONT, BOLD, ITAL = "Times-Roman", "Times-Bold", "Times-Italic"
SIZE, LEAD = 12, 18          # 12 pt, 1.5 line spacing

body = ParagraphStyle("body", fontName=FONT, fontSize=SIZE, leading=LEAD,
                      alignment=TA_JUSTIFY, spaceAfter=LEAD * 0.5)
plain = ParagraphStyle("plain", parent=body, alignment=TA_LEFT, spaceAfter=2)
head = ParagraphStyle("head", parent=body, fontName=BOLD, alignment=TA_LEFT,
                      spaceBefore=LEAD * 0.6, spaceAfter=LEAD * 0.25,
                      keepWithNext=1)
subj = ParagraphStyle("subj", parent=body, fontName=BOLD, alignment=TA_LEFT,
                      spaceBefore=LEAD * 0.5, spaceAfter=LEAD * 0.5)
sig = ParagraphStyle("sig", parent=body, alignment=TA_LEFT, spaceAfter=0)

doc = SimpleDocTemplate(
    OUT, pagesize=LETTER,
    leftMargin=inch, rightMargin=inch, topMargin=inch, bottomMargin=inch,
    title="Appeal of Corrective Action Issued September 8, 2026",
    author="Stacey Doret", subject="Written appeal of corrective action",
)

S = []
A = S.append

for line in [
    "<b>To:</b>&nbsp;&nbsp;&nbsp;&nbsp;Human Resources &#8212; Employee Relations, Cleveland Clinic",
    "<b>From:</b>&nbsp;&nbsp;Stacey Doret, Employee ID 1026617",
    "<b>Date:</b>&nbsp;&nbsp;September 14, 2026",
]:
    A(Paragraph(line, plain))

A(Spacer(1, LEAD * 0.5))
A(HRFlowable(width="100%", thickness=0.75, color="#000000",
             spaceBefore=0, spaceAfter=LEAD * 0.4))
A(Paragraph("<b>Re:&nbsp; Appeal of Corrective Action Issued September 8, 2026</b>", subj))

A(Paragraph(
    "I am submitting this written statement to appeal the corrective action issued to me "
    "on September 8, 2026, within the seven calendar day period provided in the Corrective "
    "Action Employee Acknowledgement.", body))

A(Paragraph("1.&nbsp; The Cited Period Falls Within an Approved FMLA Leave Period", head))
A(Paragraph(
    "On September 9, 2026, the Absence Management Office issued my Notice of Eligibility and "
    "Designation Notice (Case ID 1000072376) approving intermittent FMLA leave "
    "<b>from August 26, 2026 through on or about August 25, 2027</b>. The Designation Notice "
    "states: <i>&#8220;APPROVED For FMLA leave. All leave for this reason will be designated "
    "as FMLA leave.&#8221;</i>", body))
A(Paragraph(
    "The corrective action was issued September 8, 2026 &#8212; <b>within that approved leave "
    "period</b>. The Notice of Eligibility further confirms that I notified the Absence "
    "Management Office on September 2, 2026, six days before the corrective action was issued.", body))
A(Paragraph(
    "I therefore request that any occurrence cited in this corrective action that falls on or "
    "after August 26, 2026 be designated as FMLA leave and removed from my attendance record.", body))

A(Paragraph("2.&nbsp; The Certified Frequency and Duration Covers These Absences", head))
A(Paragraph(
    "My provider certified a frequency and duration of <i>&#8220;2 time per week lasting 9 hours "
    "per episode,&#8221;</i> with appointments at a rate of twice per month. The occurrences at "
    "issue are partial-day late arrivals, which fall well within that certification.", body))
A(Paragraph(
    "Per the Absence Management Office&#8217;s own instructions, absences in closed pay periods "
    "are corrected through a timecard correction request in Workday, and I am submitting those "
    "corrections.", body))

A(Paragraph("3.&nbsp; One Occurrence Resulted From a Police Investigation on My Commuter Rail Line", head))
A(Paragraph(
    "On Thursday, September 3, 2026, at approximately 6:15 a.m., a fatality occurred on the "
    "Tri-Rail tracks in the 6200 block of North Andrews Avenue in Fort Lauderdale &#8212; in the "
    "immediate vicinity of the Cypress Creek station on the line I ride to work &#8212; prompting "
    "a Fort Lauderdale Police response and investigation. The incident was reported by WSVN 7News "
    "and Local 10 News that day. My commute that morning was delayed as a result. This was a "
    "public emergency on my transit line, outside my control.", body))

A(Paragraph("4.&nbsp; A Reasonable Accommodation Request Was Pending Before This Action Issued", head))
A(Paragraph(
    "I initiated a request for a reasonable accommodation regarding my start time on approximately "
    "September 3, 2026 and followed up in writing with Human Resources on September 4, 2026 &#8212; "
    "before this corrective action was issued. My manager has since adjusted my start time by "
    "fifteen minutes, confirming that an adjustment is operationally feasible. My documentation "
    "appointment with my treating provider is scheduled for September 14, 2026.", body))

A(Paragraph("Requested Outcome", head))
A(Paragraph(
    "I ask that the corrective action be rescinded, and specifically that <b>the associated "
    "ineligibility period ending December 8, 2026 be lifted</b>, so that I am not barred from "
    "applying to internal positions while this matter is resolved.", body))

A(Paragraph(
    "Copies of my FMLA Notice of Eligibility and Designation Notice are enclosed. If this "
    "statement should be directed to another representative within Human Resources, please "
    "forward it accordingly and confirm receipt.", body))

A(Spacer(1, LEAD * 0.6))
A(KeepTogether([
    Paragraph("Respectfully,", sig),
    Spacer(1, LEAD * 1.6),
    Paragraph("Stacey Doret", sig),
    Paragraph("Employee ID 1026617", sig),
]))

A(Spacer(1, LEAD * 0.8))
A(Paragraph("<b>Enclosures:</b>&nbsp; FMLA Notice of Eligibility (9/9/2026); "
            "FMLA Designation Notice (9/9/2026)",
            ParagraphStyle("enc", parent=plain, fontSize=11, leading=16)))

doc.build(S)
print("WROTE", OUT)
