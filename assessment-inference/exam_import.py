"""Deterministic import of a Word exam followed by its official marking guide."""

import base64
import binascii
import io
import re
import unicodedata
import zipfile
from decimal import Decimal
from xml.etree import ElementTree as ET

DOCX_LIMIT = 5 * 1024 * 1024
XML_LIMIT = 3 * 1024 * 1024
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
M = "{http://schemas.openxmlformats.org/officeDocument/2006/math}"
WORD_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"
POINTS = r"(\d+(?:[.,]\d{1,3})?)\s*(?:điểm|đ\b)"
QUESTION = re.compile(r"^Câu\s+(\d+)\s*(?:\(([^()]*)\))?\s*[:.]\s*(.*)", re.I)
OPTION = re.compile(r"(?<!\S)([A-H])\.\s+")
PART = re.compile(r"^([a-j])\s*\.\s*(?:\(([^()]*)\)\s*[:.]?\s*)?(.*)$", re.I)


# "mỗi ý đúng 0,25 điểm" inside one criterion's answer text: partial credit the
# guide itself grants, read accent-insensitively.
EACH_POINT = re.compile(r"moi y(?: dung)?(?: duoc)?\s*:?\s*(\d+(?:[.,]\d{1,3})?)\s*(?:diem|d\b)")


class ExamImportError(ValueError):
    pass


def _invalid():
    return ExamImportError("exam_import_structure_invalid")


def _fold(value):
    return "".join(
        char for char in unicodedata.normalize("NFD", value.casefold())
        if not unicodedata.combining(char)
    ).replace("đ", "d")


def _xml(archive, name):
    with archive.open(name) as part:
        payload = part.read(XML_LIMIT + 1)
    if len(payload) > XML_LIMIT:
        raise ExamImportError("exam_import_document_limit")
    content = payload.decode("utf-8-sig")
    if re.search(r"<!\s*(?:DOCTYPE|ENTITY)", content, re.I):
        raise ExamImportError("exam_import_invalid_docx")
    return ET.fromstring(content)


def _blocks(encoded):
    try:
        if len(encoded) > 4 * ((DOCX_LIMIT + 2) // 3):
            raise ExamImportError("exam_import_document_limit")
        raw = base64.b64decode(encoded, validate=True)
        if len(raw) > DOCX_LIMIT:
            raise ExamImportError("exam_import_document_limit")
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            entries = archive.infolist()
            if len(entries) > 512 or sum(entry.file_size for entry in entries) > 32 * 1024 * 1024:
                raise ExamImportError("exam_import_document_limit")
            if len({entry.filename for entry in entries}) != len(entries):
                raise ExamImportError("exam_import_invalid_docx")
            types = _xml(archive, "[Content_Types].xml")
            if not any(
                part.get("PartName") == "/word/document.xml" and part.get("ContentType") == WORD_MIME
                for part in types
            ):
                raise ExamImportError("exam_import_invalid_docx")
            root = _xml(archive, "word/document.xml")
    except (binascii.Error, zipfile.BadZipFile, KeyError, ET.ParseError, UnicodeError, RuntimeError, NotImplementedError) as error:
        raise ExamImportError("exam_import_invalid_docx") from error
    body = root.find(W + "body")
    if root.tag != W + "document" or body is None:
        raise ExamImportError("exam_import_invalid_docx")
    blocks = []
    for block in body:
        if block.tag == W + "p":
            blocks.append(_text(block))
        elif block.tag == W + "tbl":
            if any(item is not block for item in block.iter(W + "tbl")):
                raise _invalid()
            blocks.append([
                ["\n".join(_text(p) for p in cell.findall(W + "p")).strip()
                 for cell in row.findall(W + "tc")]
                for row in block.findall(W + "tr")
            ])
        elif block.tag not in {W + name for name in ("sectPr", "bookmarkStart", "bookmarkEnd")}:
            raise ExamImportError("exam_import_unsupported_content")
    return blocks


def _text(element):
    def render(node, depth=0):
        if depth > 80:
            raise ExamImportError("exam_import_document_limit")
        if node.tag in {W + "drawing", W + "pict", W + "object", W + "altChunk"}:
            raise ExamImportError("exam_import_unsupported_content")
        if node.tag in {W + "t", M + "t"}:
            return node.text or ""
        if node.tag in {W + "br", W + "cr"}:
            return "\n"
        if node.tag == W + "tab":
            return " "
        def part(tag):
            child = node.find(M + tag)
            return render(child, depth + 1) if child is not None else ""
        if node.tag == M + "f":
            return f"({part('num')})/({part('den')})"
        if node.tag in {M + "sSub", M + "sSup", M + "sSubSup"}:
            sub = part("sub")
            sup = part("sup")
            return part("e") + ("_" + sub if sub else "") + ("^" + sup if sup else "")
        if node.tag.startswith(M):
            name = node.tag[len(M):]
            if name.endswith("Pr"):
                return ""
            if name not in {"oMath", "oMathPara", "r", "e", "num", "den", "sub", "sup", "box"}:
                raise ExamImportError("exam_import_unsupported_content")
        if node.tag in {W + "pPr", W + "rPr", W + "del"}:
            return ""
        return "".join(render(child, depth + 1) for child in node)
    return unicodedata.normalize("NFC", render(element)).strip()


def _lines(blocks):
    for block in blocks:
        if isinstance(block, str):
            values = [block]
        elif block and [_fold(cell) for cell in block[0]] == ["noi dung", "d/s"]:
            values = [row[0] for row in block[1:] if row]
        else:
            values = [cell for row in block for cell in row]
        for value in values:
            yield from (line.strip() for line in value.splitlines() if line.strip())


def _units(number):
    return int(Decimal(number.replace(",", ".")) * 1000)


def _score(text):
    match = re.search(POINTS, text or "", re.I)
    return _units(match[1]) if match else None


def _split(blocks):
    marks = [
        index for index, block in enumerate(blocks)
        if isinstance(block, str) and _fold(block).startswith("huong dan cham")
    ]
    if len(marks) != 1:
        raise _invalid()
    return blocks[:marks[0]], blocks[marks[0] + 1:]


def _question_blocks(lines):
    section = ""
    questions = {}
    current = None
    for line in lines:
        folded = _fold(line)
        if folded.startswith("phan ii") and "tu luan" in folded:
            section, current = "II", None
        elif folded.startswith("phan i.") and "trac nghiem" in folded:
            section, current = "I", None
        elif folded.startswith(("dang thuc", "moi cau")):
            current = None
        elif re.fullmatch(r"[ *]*het[ *]*", folded):
            break
        elif section and (match := QUESTION.fullmatch(line)):
            key = f"{section}.{int(match[1])}"
            if key in questions:
                raise _invalid()
            current = []
            questions[key] = (match[2], current)
            if match[3]:
                current.append(match[3])
        elif current is not None:
            current.append(line)
    return questions


def _marking_tables(blocks):
    choices, true_false, rubrics = {}, {}, {}
    for rows in (block for block in blocks if isinstance(block, list) and block):
        for index, row in enumerate(rows[:-1]):
            if len(row) < 2 or _fold(row[0]) != "cau" or _fold(rows[index + 1][0]) != "dap an":
                continue
            answers = rows[index + 1]
            if len(row) != len(answers):
                raise _invalid()
            for number, answer in zip(row[1:], answers[1:]):
                if not number.isdecimal() or int(number) in choices:
                    raise _invalid()
                choices[int(number)] = answer.strip().upper()
        if [_fold(cell) for cell in rows[0]] == ["cau", "y", "dap an", "diem"]:
            number = None
            for row in rows[1:]:
                if len(row) != 4:
                    raise _invalid()
                match = re.match(r"^Câu\s+(\d+)\s*:", row[0], re.I)
                if match:
                    number = int(match[1])
                if number is None:
                    raise _invalid()
                part = re.match(r"^([a-j])\.", row[1], re.I)
                key = f"II.{number}" + (f".{part[1].lower()}" if part else "")
                if key in rubrics:
                    raise _invalid()
                rubrics[key] = (row[2], row[3])
            continue
        for row in rows:
            if len(row) != 2:
                continue
            match = QUESTION.match(row[0])
            if not match or "tra loi dung" not in _fold(row[1]):
                continue
            number = int(match[1])
            if number in true_false:
                raise _invalid()
            pairs = re.findall(r"\b([a-j])\.\s*(dung|sai|d|s)\b", _fold(row[0]))
            rules = re.findall(r"tra loi dung\s+(\d+)\s+y\s*:\s*(\d+(?:[.,]\d{1,3})?)\s*diem", _fold(row[1]))
            if len(dict(pairs)) != len(pairs) or len(dict(rules)) != len(rules):
                raise _invalid()
            true_false[number] = ({key: value in {"dung", "d"} for key, value in pairs},
                                  {int(count): _units(score) for count, score in rules}, row)
    return choices, true_false, rubrics


def _rubric_criteria(answer, points, max_units):
    scores = [_units(match) for match in re.findall(POINTS, points, re.I)]
    if not scores or sum(scores) != max_units or any(not score for score in scores):
        return []
    lines = [line.strip() for line in answer.splitlines() if line.strip()]
    if not lines:
        return []
    if len(scores) == 1:
        groups = [lines]
    else:
        stars = [i for i, line in enumerate(lines) if line.startswith("*")]
        if len(stars) == len(scores) and stars[0] == 0:
            starts = stars
        else:
            starts = [i for i, line in enumerate(lines) if line.startswith(("*", "-"))]
            # A heading ending in a colon can introduce several individually scored bullets.
            if len(starts) == len(scores) + 1 and lines[starts[0]].endswith(":"):
                starts.pop(0)
        if len(starts) != len(scores):
            return []
        groups = [lines[start:end] for start, end in zip(starts, starts[1:] + [len(lines)])]
    return [
        {"id": f"c{index}", "description": "\n".join(group).lstrip("*- "),
         "maxUnits": score, "levels": _levels("\n".join(group), score)}
        for index, (group, score) in enumerate(zip(groups, scores), 1)
    ]


def _levels(text, score):
    """Two levels unless the guide states a per-point value that divides the
    criterion evenly into 2–12 steps; never invents an intermediate level."""
    match = EACH_POINT.search(_fold(text))
    step = _units(match[1]) if match else 0
    if step and score % step == 0 and 2 <= score // step <= 12:
        return [
            {"pointsUnits": count * step,
             "description": "Không đạt ý nào" if count == 0 else f"Đạt {count} ý theo hướng dẫn chấm"}
            for count in range(score // step + 1)
        ]
    return [
        {"pointsUnits": 0, "description": "Không đạt tiêu chí"},
        {"pointsUnits": score, "description": "Đạt tiêu chí theo hướng dẫn chấm"},
    ]


def parse_exam(encoded, exam_code, expected_units):
    exam, marking = _split(_blocks(encoded))
    lines = list(_lines(exam))
    joined = "\n".join(lines)
    subject = re.search(r"^MÔN\s*:\s*(.+?)\s+(\d{1,2})\s*$", joined, re.I | re.M)
    page_count = re.search(r"gồm\s+có\s+(\d+)\s+trang", joined, re.I)
    printed_codes = re.findall(r"\bMã\s+đề\s*[:.]\s*([\w.-]+)", joined, re.I)
    if printed_codes and set(printed_codes) != {exam_code}:
        raise ExamImportError("exam_import_code_mismatch")
    if not subject or not 1 <= int(subject[2]) <= 12:
        raise _invalid()
    declared_pages = int(page_count[1]) if page_count else 1
    if not 1 <= declared_pages <= 100:
        raise _invalid()
    warnings = []
    if not page_count:
        warnings.append("Chưa thấy số trang đề in trong tài liệu. Hãy xác nhận trước khi duyệt.")
    if not printed_codes:
        warnings.append("File không in mã đề. Hãy đối chiếu mã đã nhập với đề phát cho học sinh.")
    choice_units = next(
        (_score(line) for line in lines if "moi cau" in _fold(line) and _score(line)),
        None,
    )
    choices, true_false, rubrics = _marking_tables(marking)
    blocks = _question_blocks(lines)
    questions, source = [], {}

    def append(key, text, max_units, official, **specific):
        if not text or max_units is None or max_units <= 0:
            raise _invalid()
        source_id = f"docx-{key}"
        source[source_id] = official
        questions.append({"questionKey": key, "text": text, "maxUnits": max_units,
                          "sourceRegionIds": [source_id], **specific})

    def essay(key, text, max_units):
        rubric = rubrics.pop(key, None)
        answer, points = rubric or ("", "")
        criteria = _rubric_criteria(answer, points, max_units)
        if not criteria:
            warnings.append(f"Câu {key}: chưa ghép được các tiêu chí và điểm. Hãy nhập tiêu chí trước khi duyệt.")
        folded = _fold(text)
        drawing = re.search(r"\bve\s+(?:\d+\s+)?(?:hinh|ban ve)", folded) is not None
        # Câu "so sánh" học sinh có thể trả lời bằng đoạn văn hoặc bảng; vẫn chấm theo
        # tiêu chí văn bản (rubric_text) nên AI được phép chấm, chỉ mở rộng dạng trả lời.
        compare = not drawing and "so sanh" in folded
        forms = ["drawing"] if drawing else (["text", "table"] if compare else ["text"])
        kind = "rubric_drawing" if drawing else "rubric_text"
        append(key, text, max_units, f"{text}\n{answer}\n{points}".strip(),
               kind=kind, criteria=criteria, acceptedAnswerForms=forms)

    for key, (declared, body) in blocks.items():
        number = int(key.split(".")[1])
        if key.startswith("II."):
            parts = [(index, match) for index, line in enumerate(body) if (match := PART.fullmatch(line))]
            if parts:
                if len({match[1].lower() for _, match in parts}) != len(parts):
                    raise _invalid()
                parent = "\n".join(body[:parts[0][0]])
                for (start, part), end in zip(parts, [index for index, _ in parts[1:]] + [len(body)]):
                    part_key = f"{key}.{part[1].lower()}"
                    text = "\n".join(filter(None, [parent, part[3], *body[start + 1:end]]))
                    essay(part_key, text, _score(part[2]))
            else:
                essay(key, "\n".join(body), _score(declared))
            continue

        text = "\n".join(body)
        statement_matches = [(index, match) for index, line in enumerate(body)
                             if (match := PART.fullmatch(line)) and match[1].islower()]
        if statement_matches:
            statements = [
                {"id": item[1].lower(), "text": " ".join([item[3], *body[start + 1:end]]).strip()}
                for (start, item), end in zip(statement_matches, [i for i, _ in statement_matches[1:]] + [len(body)])
            ]
            ids = {item["id"] for item in statements}
            if not all(item["text"] for item in statements) or len(ids) != len(statements):
                raise _invalid()
            marking_row = true_false.pop(number, None)
            keys, rules, official = marking_row or ({}, {}, [])
            valid_keys = keys if keys.keys() == ids else None
            count = len(statements)
            score_map = [0, *[rules.get(index) for index in range(1, count + 1)]]
            valid_policy = (set(rules) == set(range(1, count + 1)) and score_map == sorted(score_map))
            max_units = _score(declared) or (rules[count] if valid_policy else None)
            if valid_keys is None or not valid_policy or rules[count] != max_units:
                warnings.append(f"Câu {key}: kiểm tra đáp án Đúng/Sai và biểu điểm theo số ý đúng.")
            append(key, "\n".join(body[:statement_matches[0][0]]), max_units,
                   "\n".join([text, *official]), kind="true_false_group", statements=statements,
                   answerKey=valid_keys,
                   scoringPolicy={"kind": "count_map", "unitsByCorrectCount": score_map} if valid_policy and rules[count] == max_units else None)
        else:
            matches = list(OPTION.finditer(text))
            options = [{"id": match[1], "text": text[match.end():end].strip()}
                       for match, end in zip(matches, [item.start() for item in matches[1:]] + [len(text)])]
            if not 2 <= len(options) <= 8 or not all(option["text"] for option in options) or len({o["id"] for o in options}) != len(options):
                raise _invalid()
            answer = choices.pop(number, None)
            if answer not in {option["id"] for option in options}:
                warnings.append(f"Câu {key}: kiểm tra đáp án trắc nghiệm trước khi duyệt.")
                answer = None
            append(key, text[:matches[0].start()].strip(), _score(declared) or choice_units,
                   f"{text}\nĐáp án: {answer or 'Chưa xác định'}", kind="single_choice",
                   options=options, answerKey=answer)

    if not questions or len(questions) > 200 or choices or true_false or rubrics:
        raise _invalid()
    if sum(q["maxUnits"] for q in questions) != expected_units:
        raise ExamImportError("exam_import_score_mismatch")
    return {
        "document": {"schemaVersion": 1, "subject": subject[1], "grade": int(subject[2]),
                     "examCode": exam_code, "declaredExamPageCount": declared_pages,
                     "pointScale": 1000, "maxScoreUnits": expected_units, "questions": questions,
                     "gradingDefaults": {"blankScoreUnits": 0, "carryForwardErrorPolicy": "no_duplicate_penalty",
                                         "rounding": {"mode": "half_up", "normalizeTo": 10, "targetDecimals": 1}}},
        "warnings": warnings,
        "source": source,
    }
