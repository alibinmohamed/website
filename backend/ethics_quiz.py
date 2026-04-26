"""
ethics_quiz.py
--------------
Authoritative quiz catalogue for the Cybersecurity Ethics & Laws course.

Every question's correct answer is held SERVER-SIDE. The public catalogue
endpoint (/api/progress/ethics/catalogue) intentionally strips the
``correct`` index and the explanation so a curious student can't just read
the source to cheat. Validation happens through
``POST /api/progress/ethics/answer``.

The course content is drawn from real, citable educational sources:

  * ACM Code of Ethics and Professional Conduct (2018 update)
        https://www.acm.org/code-of-ethics
  * (ISC)\u00b2 Code of Ethics
        https://www.isc2.org/Ethics
  * IEEE Computer Society / Software Engineering Code of Ethics (Joint with ACM)
        https://ethics.acm.org/code-of-ethics/software-engineering-code/
  * NIST SP 800-12 Rev. 1 \u2014 Introduction to Information Security
  * NIST Cybersecurity Framework (CSF) and NIST Privacy Framework
  * NIST AI Risk Management Framework (AI RMF 1.0, 2023)
  * NIST SP 800-115 \u2014 Technical Guide to Information Security Testing
  * ISO/IEC 29147 \u2014 Vulnerability Disclosure
  * MITRE CVE Program  \u2014 https://cve.mitre.org/
  * Google Project Zero Disclosure Policy
  * Regulation (EU) 2016/679 \u2014 General Data Protection Regulation (GDPR)
  * U.S. Health Insurance Portability and Accountability Act (HIPAA, 1996)
  * U.S. Computer Fraud and Abuse Act \u2014 18 U.S.C. \u00a7 1030 (CFAA)
  * U.K. Computer Misuse Act 1990
  * Council of Europe Convention on Cybercrime (Budapest Convention, 2001)
  * Kingdom of Bahrain \u2014 Personal Data Protection Law, Law No. 30 of 2018
  * Kingdom of Bahrain \u2014 Cybercrime Law, Decree-Law No. 60 of 2014
  * U.S. Digital Millennium Copyright Act (DMCA, 1998)
  * Regulation (EU) 2024/1689 \u2014 EU Artificial Intelligence Act
  * Spinello, R. \u201cCyberethics: Morality and Law in Cyberspace\u201d
        (Jones & Bartlett, 7th ed.)
  * Tavani, H. \u201cEthics and Technology\u201d (Wiley, 6th ed.)

ID range: 2101..2999 (chapter * 100 + 2000 + n) so we don't collide with the
Linux course (1..34), the Network course (101..904) or the Web course
(1101..1904).
"""
from typing import Dict, List, Optional


# ---------------------------------------------------------------------------
# The full catalogue. Each question is a dict with:
#   id          \u2014 unique integer
#   xp          \u2014 reward when answered correctly the FIRST time
#   question    \u2014 the prompt the student sees
#   choices     \u2014 list of 4 strings, indexed 0..3
#   correct     \u2014 integer index of the correct choice (KEPT SERVER-SIDE)
#   explanation \u2014 short rationale shown after the student answers
#   source      \u2014 short citation (also kept server-side; surfaced in feedback)
# ---------------------------------------------------------------------------
ETHICS_QUIZ: Dict[int, List[dict]] = {
    # =====================================================================
    1: [  # Introduction to Cybersecurity Ethics
        {
            "id": 2101, "xp": 12,
            "question": "Which of the following best describes ethics as distinct from law?",
            "choices": [
                "Ethics and law always say exactly the same thing.",
                "Ethics describes only what a society's legal system enforces.",
                "Ethics describes what is right or wrong; law describes what is legal or illegal \u2014 the two often overlap but can diverge.",
                "Ethics applies only to computer-security professionals.",
            ],
            "correct": 2,
            "explanation": "Spinello (Cyberethics, ch. 1) and Tavani (Ethics and Technology, ch. 2) both stress that ethics and law are related but separate normative systems. Lawful conduct can still be unethical (e.g. legal-but-deceptive dark patterns) and ethical conduct can occasionally violate the law (classic civil-disobedience cases).",
            "source": "Spinello, Cyberethics, ch. 1; Tavani, Ethics and Technology, ch. 2.",
        },
        {
            "id": 2102, "xp": 12,
            "question": "The Therac-25 incident is most often cited in computing-ethics curricula because it demonstrates that:",
            "choices": [
                "Open-source software is inherently unsafe.",
                "Software defects can directly cause physical harm to humans, making professional responsibility a life-and-death matter.",
                "Hardware engineers should never write software.",
                "Nuclear plants need cybersecurity.",
            ],
            "correct": 1,
            "explanation": "Between 1985\u20131987 the Therac-25 radiation-therapy machine delivered massive radiation overdoses to six patients, killing several, after a race condition in software replaced hardware interlocks. Leveson & Turner's IEEE Computer paper (1993) made it the canonical case-study for the Software Engineering Code of Ethics.",
            "source": "Leveson & Turner, \u201cAn Investigation of the Therac-25 Accidents\u201d, IEEE Computer, July 1993.",
        },
        {
            "id": 2103, "xp": 12,
            "question": "\u201cEthical hacking\u201d is best defined as:",
            "choices": [
                "Hacking that does not leave forensic traces.",
                "Using offensive security techniques on systems with the explicit, written permission of the owner and within an agreed scope.",
                "Hacking only systems run by criminals.",
                "Hacking only on weekends.",
            ],
            "correct": 1,
            "explanation": "EC-Council, SANS, OffSec and (ISC)\u00b2 all define ethical / authorised hacking as offensive testing performed under written authorisation, within a defined scope, for the benefit of the system owner. Without authorisation, the same act is a crime under the CFAA / Computer Misuse Act / Bahrain Cybercrime Law.",
            "source": "EC-Council CEH Handbook; SANS \u201cPenetration Testing\u201d course materials.",
        },
        {
            "id": 2104, "xp": 12,
            "question": "Which of the following is NOT a goal of cybersecurity ethics?",
            "choices": [
                "Protecting human well-being.",
                "Maximising the financial profit of the security tester regardless of impact.",
                "Preserving privacy.",
                "Honest disclosure of risk to those affected.",
            ],
            "correct": 1,
            "explanation": "Every major code (ACM, IEEE-CS, (ISC)\u00b2, EC-Council) places \u201chuman well-being\u201d and \u201cthe public interest\u201d above commercial advantage. Profit can be a motive, but it cannot override harm to people.",
            "source": "ACM Code of Ethics 2018, Principle 1.1; (ISC)\u00b2 Canon I.",
        },
    ],

    # =====================================================================
    2: [  # Ethical Frameworks for Practitioners
        {
            "id": 2201, "xp": 12,
            "question": "How many \u201cCanons\u201d are in the (ISC)\u00b2 Code of Ethics?",
            "choices": ["3", "4", "6", "10"],
            "correct": 1,
            "explanation": "The (ISC)\u00b2 Code of Ethics consists of a Preamble plus exactly four Canons, each more specific than the last.",
            "source": "(ISC)\u00b2 Code of Ethics, https://www.isc2.org/Ethics",
        },
        {
            "id": 2202, "xp": 12,
            "question": "What is the FIRST Canon of the (ISC)\u00b2 Code of Ethics?",
            "choices": [
                "Act honourably, honestly, justly, responsibly, and legally.",
                "Provide diligent and competent service to principals.",
                "Protect society, the common good, necessary public trust and confidence, and the infrastructure.",
                "Advance and protect the profession.",
            ],
            "correct": 2,
            "explanation": "The four Canons are explicitly ordered. Canon I prioritises society and the public interest; conflicts between later Canons are resolved in favour of the earlier one.",
            "source": "(ISC)\u00b2 Code of Ethics, Canon I.",
        },
        {
            "id": 2203, "xp": 12,
            "question": "The 2018 ACM Code of Ethics opens with which General Principle?",
            "choices": [
                "Contribute to society and to human well-being, acknowledging that all people are stakeholders in computing.",
                "Maximise shareholder value.",
                "Avoid all software bugs.",
                "Disclose all vulnerabilities publicly within 24 hours.",
            ],
            "correct": 0,
            "explanation": "Principle 1.1 of the 2018 ACM Code reads literally \u201cContribute to society and to human well-being, acknowledging that all people are stakeholders in computing.\u201d It is the foundation on which every other principle rests.",
            "source": "ACM Code of Ethics and Professional Conduct (2018), Principle 1.1.",
        },
        {
            "id": 2204, "xp": 12,
            "question": "Which professional body publishes the Software Engineering Code of Ethics jointly with ACM?",
            "choices": [
                "IEEE Computer Society.",
                "Mozilla Foundation.",
                "Linux Foundation.",
                "OWASP.",
            ],
            "correct": 0,
            "explanation": "The Software Engineering Code of Ethics and Professional Practice is a joint product of the IEEE-CS / ACM Joint Task Force on Software Engineering Ethics and Professional Practices.",
            "source": "IEEE-CS / ACM Joint Task Force, Software Engineering Code v5.2.",
        },
    ],

    # =====================================================================
    3: [  # The CIA Triad and Privacy
        {
            "id": 2301, "xp": 10,
            "question": "The \u201cI\u201d in the CIA triad stands for:",
            "choices": ["Identification", "Integrity", "Isolation", "Independence"],
            "correct": 1,
            "explanation": "Confidentiality \u2013 Integrity \u2013 Availability is the canonical triad introduced in NIST SP 800-12 and reproduced in essentially every introductory infosec text.",
            "source": "NIST SP 800-12 Rev. 1, Section 1.4.",
        },
        {
            "id": 2302, "xp": 12,
            "question": "A successful Distributed Denial-of-Service attack against a hospital web portal primarily violates which property?",
            "choices": ["Confidentiality", "Integrity", "Availability", "Authenticity"],
            "correct": 2,
            "explanation": "DDoS attacks degrade or destroy availability \u2014 the timely, reliable access to information and resources \u2014 without necessarily reading or modifying data.",
            "source": "NIST SP 800-12 Rev. 1, Section 1.4.3.",
        },
        {
            "id": 2303, "xp": 12,
            "question": "\u201cNon-repudiation\u201d provides which assurance?",
            "choices": [
                "That data is encrypted at rest.",
                "That a party cannot plausibly deny having sent or signed a particular message.",
                "That backups exist and have been tested.",
                "That every user has a unique password.",
            ],
            "correct": 1,
            "explanation": "Non-repudiation, achieved typically through digital signatures, ensures the originator cannot later deny authorship, and the recipient cannot deny receipt.",
            "source": "ISO/IEC 27000:2018 vocabulary.",
        },
        {
            "id": 2304, "xp": 12,
            "question": "Which framework, published by NIST, focuses specifically on managing privacy risk (rather than general cybersecurity risk)?",
            "choices": [
                "NIST SP 800-12.",
                "NIST Cybersecurity Framework (CSF).",
                "NIST Privacy Framework.",
                "NIST SP 800-53.",
            ],
            "correct": 2,
            "explanation": "The NIST Privacy Framework v1.0 (Jan 2020) is a voluntary tool focused exclusively on privacy risk management, designed to complement the CSF for security risk.",
            "source": "NIST Privacy Framework v1.0 (2020).",
        },
    ],

    # =====================================================================
    4: [  # Privacy & Data Protection Laws
        {
            "id": 2401, "xp": 15,
            "question": "Under the GDPR, the controller must notify the supervisory authority of a personal-data breach \u201cwithout undue delay\u201d and where feasible within:",
            "choices": ["24 hours", "48 hours", "72 hours", "7 days"],
            "correct": 2,
            "explanation": "Article 33(1) of the GDPR sets a 72-hour notification deadline (where feasible) after the controller becomes aware of the breach.",
            "source": "Regulation (EU) 2016/679, Article 33(1).",
        },
        {
            "id": 2402, "xp": 15,
            "question": "Bahrain's Personal Data Protection Law (PDPL) is officially:",
            "choices": [
                "Decree-Law No. 60 of 2014",
                "Law No. 30 of 2018",
                "Law No. 47 of 2002",
                "Decree-Law No. 28 of 2002",
            ],
            "correct": 1,
            "explanation": "The PDPL was issued as Law No. (30) of 2018 and entered into force on 1 August 2019. It is the primary general data-protection statute in Bahrain.",
            "source": "Kingdom of Bahrain, Law No. 30 of 2018 (PDPL).",
        },
        {
            "id": 2403, "xp": 12,
            "question": "Which U.S. federal law governs the privacy of \u201cProtected Health Information\u201d (PHI)?",
            "choices": [
                "GLBA (Gramm-Leach-Bliley Act)",
                "HIPAA (Health Insurance Portability and Accountability Act)",
                "FERPA (Family Educational Rights and Privacy Act)",
                "COPPA (Children's Online Privacy Protection Act)",
            ],
            "correct": 1,
            "explanation": "HIPAA's Privacy Rule (45 CFR Part 164) governs the use and disclosure of Protected Health Information by covered entities and business associates.",
            "source": "Health Insurance Portability and Accountability Act of 1996, Public Law 104-191.",
        },
        {
            "id": 2404, "xp": 12,
            "question": "The \u201cright to erasure\u201d (right to be forgotten) is established by which Article of the GDPR?",
            "choices": ["Article 5", "Article 17", "Article 22", "Article 33"],
            "correct": 1,
            "explanation": "Article 17 of the GDPR codifies the right to erasure, including the obligation on a controller who has made the data public to take reasonable steps to inform other controllers.",
            "source": "Regulation (EU) 2016/679, Article 17.",
        },
    ],

    # =====================================================================
    5: [  # Computer Crime Laws
        {
            "id": 2501, "xp": 12,
            "question": "The Computer Fraud and Abuse Act (CFAA) is a law of which jurisdiction?",
            "choices": [
                "The United Kingdom",
                "The United States",
                "The European Union",
                "The Kingdom of Bahrain",
            ],
            "correct": 1,
            "explanation": "The CFAA is U.S. federal law, codified at 18 U.S.C. \u00a7 1030, originally enacted in 1986 and amended several times since.",
            "source": "18 U.S.C. \u00a7 1030 (Computer Fraud and Abuse Act).",
        },
        {
            "id": 2502, "xp": 15,
            "question": "Under the U.K. Computer Misuse Act 1990, \u201cSection 1\u201d criminalises:",
            "choices": [
                "Possession of so-called \u201chacking tools\u201d.",
                "Unauthorised access to computer material.",
                "Sending unsolicited commercial email (spam).",
                "Failure to install antivirus software on company devices.",
            ],
            "correct": 1,
            "explanation": "Section 1 of the Computer Misuse Act 1990 creates the basic offence of unauthorised access to computer material. Sections 2 and 3 add aggravated and modification-related offences.",
            "source": "U.K. Computer Misuse Act 1990, s.1.",
        },
        {
            "id": 2503, "xp": 15,
            "question": "The Budapest Convention on Cybercrime \u2014 the first international treaty addressing computer crime \u2014 was opened for signature in:",
            "choices": ["1995", "2001", "2010", "2018"],
            "correct": 1,
            "explanation": "The Council of Europe Convention on Cybercrime (Budapest Convention) was opened for signature on 23 November 2001 and entered into force on 1 July 2004.",
            "source": "Council of Europe, ETS No. 185 (2001).",
        },
        {
            "id": 2504, "xp": 12,
            "question": "Bahrain's principal cybercrime statute is:",
            "choices": [
                "Decree-Law No. 60 of 2014",
                "Law No. 30 of 2018",
                "Law No. 47 of 2002",
                "Decree-Law No. 28 of 2002",
            ],
            "correct": 0,
            "explanation": "Decree-Law No. 60 of 2014 \u201cwith respect to Information Technology Crimes\u201d is Bahrain's primary cybercrime law; Law 30/2018 is the separate PDPL covering data protection.",
            "source": "Kingdom of Bahrain, Decree-Law No. 60 of 2014.",
        },
    ],

    # =====================================================================
    6: [  # Authorized vs Unauthorized Access
        {
            "id": 2601, "xp": 12,
            "question": "Before beginning a penetration test, the most important document to obtain is:",
            "choices": [
                "A non-disclosure agreement only.",
                "A signed authorisation / Rules of Engagement specifying scope, timing and contacts.",
                "An invoice for the work.",
                "A copy of the customer's antivirus licence.",
            ],
            "correct": 1,
            "explanation": "Without a written authorisation that defines scope, the same activity that is a paid pentest becomes a federal offence in most jurisdictions. NIST SP 800-115 lists Rules of Engagement among required pre-engagement artefacts.",
            "source": "NIST SP 800-115, Section 5; PTES Pre-Engagement.",
        },
        {
            "id": 2602, "xp": 12,
            "question": "NIST Special Publication 800-115 covers:",
            "choices": [
                "Cryptographic key sizes.",
                "Technical Guide to Information Security Testing and Assessment.",
                "Wireless protocol specifications.",
                "Enterprise risk-management taxonomies.",
            ],
            "correct": 1,
            "explanation": "NIST SP 800-115 is the official technical guide to information-security testing, covering planning, execution and reporting of pentests, vulnerability scans and security reviews.",
            "source": "NIST SP 800-115.",
        },
        {
            "id": 2603, "xp": 12,
            "question": "Probing a server outside the agreed scope, even on the same target organisation, is best described as:",
            "choices": [
                "Allowed under \u201cgood-faith\u201d research.",
                "Unauthorised access \u2014 potentially a criminal offence.",
                "Encouraged by all bug-bounty programmes.",
                "Required by NIST.",
            ],
            "correct": 1,
            "explanation": "Authorisation is bounded by scope. Stepping outside the agreed scope means the act is no longer authorised, and the same statutes that protect a pentester now criminalise the activity.",
            "source": "U.S. v. Van Buren, 593 U.S. ___ (2021); CFAA \u00a7 1030(a)(2).",
        },
        {
            "id": 2604, "xp": 12,
            "question": "A bug-bounty programme's \u201cSafe Harbor\u201d clause typically promises:",
            "choices": [
                "That the vulnerability will be made public immediately.",
                "That the company will not pursue legal action against good-faith researchers who follow the programme rules.",
                "That the researcher will be hired full-time.",
                "That all findings are confidential forever.",
            ],
            "correct": 1,
            "explanation": "Safe-harbour language (popularised by Bugcrowd and HackerOne) commits the operator not to pursue civil or criminal action against researchers acting in good faith and within the programme's scope.",
            "source": "Bugcrowd \u201cdisclose.io\u201d core terms; HackerOne Gold Standard Safe Harbor.",
        },
    ],

    # =====================================================================
    7: [  # Responsible Disclosure & Vulnerability Research
        {
            "id": 2701, "xp": 12,
            "question": "Google Project Zero's standard public-disclosure deadline after notifying the vendor is:",
            "choices": ["30 days", "60 days", "90 days", "180 days"],
            "correct": 2,
            "explanation": "Project Zero's policy (revised 2021) keeps the 90-day disclosure deadline, with an additional 30-day grace period when a patch is released early.",
            "source": "Google Project Zero, \u201c2021 Disclosure Policy Update\u201d.",
        },
        {
            "id": 2702, "xp": 12,
            "question": "\u201cCVE\u201d stands for:",
            "choices": [
                "Critical Vulnerability Exploit",
                "Common Vulnerabilities and Exposures",
                "Cybersecurity Verification Engine",
                "Coordinated Vulnerability Evaluation",
            ],
            "correct": 1,
            "explanation": "CVE entries are unique, public identifiers (e.g. CVE-2024-3094) for known vulnerabilities, used industry-wide.",
            "source": "MITRE CVE Program, https://cve.mitre.org/",
        },
        {
            "id": 2703, "xp": 12,
            "question": "Which organisation maintains the CVE programme on behalf of the U.S. CISA?",
            "choices": ["NIST", "MITRE", "ENISA", "ISO"],
            "correct": 1,
            "explanation": "MITRE has operated the CVE programme since 1999 under sponsorship from CISA. NIST maintains the related National Vulnerability Database (NVD) but not the CVE list itself.",
            "source": "MITRE Corporation \u2014 CVE Program governance.",
        },
        {
            "id": 2704, "xp": 12,
            "question": "Which ISO/IEC standard provides guidance on Vulnerability Disclosure?",
            "choices": [
                "ISO/IEC 27001",
                "ISO/IEC 29147",
                "ISO/IEC 17025",
                "ISO/IEC 9001",
            ],
            "correct": 1,
            "explanation": "ISO/IEC 29147:2018 specifies how vendors should receive and process vulnerability reports; the companion ISO/IEC 30111 covers internal handling.",
            "source": "ISO/IEC 29147:2018.",
        },
    ],

    # =====================================================================
    8: [  # Intellectual Property in Cyberspace
        {
            "id": 2801, "xp": 12,
            "question": "The DMCA's Section 1201 primarily prohibits:",
            "choices": [
                "Selling counterfeit hardware.",
                "Circumventing technological measures that effectively control access to copyrighted works.",
                "Writing antivirus software.",
                "Using GPL-licensed software in commercial products.",
            ],
            "correct": 1,
            "explanation": "DMCA \u00a7 1201 (the \u201canti-circumvention\u201d provision) targets bypassing TPMs / DRM. It has narrow exemptions \u2014 reviewed every three years by the Library of Congress \u2014 for security research, accessibility and interoperability.",
            "source": "U.S. Digital Millennium Copyright Act 1998, 17 U.S.C. \u00a7 1201.",
        },
        {
            "id": 2802, "xp": 12,
            "question": "The GNU General Public License (GPL) is best classified as:",
            "choices": [
                "Public domain.",
                "A copyleft, free / open-source software licence.",
                "A proprietary licence.",
                "A trade-secret agreement.",
            ],
            "correct": 1,
            "explanation": "The GPL is a copyleft FOSS licence: derivative works that are distributed must themselves be released under the same licence (\u201cshare-alike\u201d).",
            "source": "Free Software Foundation \u2014 GNU GPL v3.",
        },
        {
            "id": 2803, "xp": 12,
            "question": "Which of the following is generally NOT considered a category of intellectual property?",
            "choices": ["Copyright", "Patent", "Trademark", "Network latency"],
            "correct": 3,
            "explanation": "Copyright, patent, trademark and trade secret are the four classical IP categories under the WIPO framework. Network latency is a performance metric.",
            "source": "World Intellectual Property Organization (WIPO) overview.",
        },
        {
            "id": 2804, "xp": 12,
            "question": "The MIT and Apache 2.0 licences are best described as:",
            "choices": [
                "Strong copyleft licences.",
                "Permissive open-source licences.",
                "Proprietary licences.",
                "Trade-secret agreements.",
            ],
            "correct": 1,
            "explanation": "MIT and Apache 2.0 are permissive licences: they allow reuse in proprietary products without imposing copyleft obligations, requiring only attribution (and, for Apache, a notice and patent grant).",
            "source": "OSI-approved licences (osi.org).",
        },
    ],

    # =====================================================================
    9: [  # AI Ethics, Surveillance & Whistleblowing
        {
            "id": 2901, "xp": 12,
            "question": "The EU Artificial Intelligence Act (Regulation 2024/1689) categorises AI systems primarily by:",
            "choices": [
                "Hardware vendor.",
                "Risk level (unacceptable, high, limited, minimal).",
                "Programming language.",
                "Country of origin.",
            ],
            "correct": 1,
            "explanation": "The EU AI Act's central design is a four-tier risk pyramid: \u201cunacceptable risk\u201d (banned), \u201chigh risk\u201d (heavy obligations), \u201climited risk\u201d (transparency duties) and \u201cminimal risk\u201d (largely unregulated).",
            "source": "Regulation (EU) 2024/1689, Articles 5\u201352.",
        },
        {
            "id": 2902, "xp": 12,
            "question": "Which whistleblower disclosed the existence of the NSA's PRISM and other mass-surveillance programmes in 2013?",
            "choices": [
                "Daniel Ellsberg",
                "Chelsea Manning",
                "Edward Snowden",
                "Julian Assange",
            ],
            "correct": 2,
            "explanation": "Edward Snowden, then a Booz Allen Hamilton contractor for the NSA, leaked documents to journalists Glenn Greenwald and Laura Poitras in June 2013, exposing PRISM and bulk-collection programmes.",
            "source": "The Guardian / Washington Post reporting, June 2013.",
        },
        {
            "id": 2903, "xp": 12,
            "question": "The NIST AI Risk Management Framework (AI RMF 1.0) was published in:",
            "choices": ["2018", "2023", "2010", "1996"],
            "correct": 1,
            "explanation": "NIST released AI RMF 1.0 in January 2023 \u2014 a voluntary framework structured around four functions: Govern, Map, Measure and Manage.",
            "source": "NIST AI 100-1, AI Risk Management Framework v1.0 (2023).",
        },
        {
            "id": 2904, "xp": 12,
            "question": "Which of the following is the most frequently cited concern of \u201calgorithmic bias\u201d?",
            "choices": [
                "Slow CPU performance on edge devices.",
                "Models reproducing or amplifying unfair treatment of protected groups present in their training data.",
                "Bandwidth consumption.",
                "Battery usage on mobile devices.",
            ],
            "correct": 1,
            "explanation": "Algorithmic bias generally refers to systematic and unfair discrimination by an automated system, often traced to non-representative training data, proxy variables, or feedback loops.",
            "source": "ACM Statement on Algorithmic Transparency and Accountability (2017); NIST AI RMF 1.0.",
        },
    ],
}


# ---------------------------------------------------------------------------
# Helpers (parallel to network_tasks.py / web_tasks.py shape)
# ---------------------------------------------------------------------------
def all_question_ids() -> List[int]:
    return [q["id"] for qs in ETHICS_QUIZ.values() for q in qs]


def question_by_id(question_id: int) -> Optional[dict]:
    for qs in ETHICS_QUIZ.values():
        for q in qs:
            if q["id"] == question_id:
                return q
    return None


def chapter_of(question_id: int) -> Optional[int]:
    for chapter, qs in ETHICS_QUIZ.items():
        if any(q["id"] == question_id for q in qs):
            return chapter
    return None


def xp_for(question_ids) -> int:
    total = 0
    for qid in question_ids or []:
        try:
            q = question_by_id(int(qid))
        except (TypeError, ValueError):
            continue
        if q:
            total += int(q.get("xp", 0))
    return total


def is_correct(question_id: int, choice_index: int) -> bool:
    q = question_by_id(int(question_id))
    if not q:
        return False
    try:
        return int(choice_index) == int(q["correct"])
    except (TypeError, ValueError):
        return False


def public_catalogue() -> list:
    """
    JSON-safe catalogue for the front-end. The ``correct`` index and the
    ``explanation`` are *intentionally omitted* so a student cannot just read
    page source. The explanation is returned by ``answer_feedback`` after
    the student submits an answer.
    """
    out = []
    for chapter, qs in ETHICS_QUIZ.items():
        out.append({
            "chapter": chapter,
            "questions": [
                {
                    "id": q["id"],
                    "xp": q["xp"],
                    "question": q["question"],
                    "choices": q["choices"],
                }
                for q in qs
            ],
        })
    return out


def answer_feedback(question_id: int, choice_index: int) -> dict:
    """Server-side response after the student picks an answer."""
    q = question_by_id(int(question_id))
    if not q:
        return {"known": False}
    correct = is_correct(question_id, choice_index)
    return {
        "known":         True,
        "correct":       correct,
        "correctIndex":  int(q["correct"]),
        "xp":            int(q["xp"]) if correct else 0,
        "explanation":   q.get("explanation", ""),
        "source":        q.get("source", ""),
    }


TOTAL_XP = sum(q["xp"] for qs in ETHICS_QUIZ.values() for q in qs)
TOTAL_QUESTIONS = len(all_question_ids())
MIN_QUESTION_ID = min(all_question_ids())
MAX_QUESTION_ID = max(all_question_ids())
