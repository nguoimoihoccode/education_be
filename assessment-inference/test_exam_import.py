import base64
import io
import unittest
import zipfile

from exam_import import ExamImportError, parse_exam


def p(text):
    return f"<w:p><w:r><w:t>{text}</w:t></w:r></w:p>"


def table(*rows):
    cells = lambda row: "".join(f"<w:tc>{p(text)}</w:tc>" for text in row)
    return "<w:tbl>" + "".join(f"<w:tr>{cells(row)}</w:tr>" for row in rows) + "</w:tbl>"


def docx(content):
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w") as output:
        output.writestr("[Content_Types].xml", '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
        output.writestr("word/document.xml", f'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><w:body>{content}</w:body></w:document>')
    return base64.b64encode(archive.getvalue()).decode("ascii")


def fixture():
    return docx(
        p("MÔN: CÔNG NGHỆ 8") + p("(Đề thi gồm có 02 trang)")
        + p("PHẦN I. TRẮC NGHIỆM") + p("Mỗi câu 0,25 điểm")
        + p("Câu 1: Tỉ số truyền")
        + '<w:p><w:r><w:t>A. </w:t></w:r><m:oMath><m:f><m:num><m:sSub><m:e><m:r><m:t>n</m:t></m:r></m:e><m:sub><m:r><m:t>1</m:t></m:r></m:sub></m:sSub></m:num><m:den><m:r><m:t>x</m:t></m:r></m:den></m:f></m:oMath><w:r><w:t> B. 2</w:t></w:r></w:p>'
        + p("Dạng thức 2: Trắc nghiệm Đúng/Sai. (1 điểm)") + p("Câu 2: Nhận xét")
        + table(("Nội dung", "Đ/S"), ("a. A đúng.", ""), ("b. B đúng.", ""))
        + p("PHẦN II. TỰ LUẬN")
        + p("Câu 1 (1 điểm): Nêu công dụng.")
        + p("HƯỚNG DẪN CHẤM VÀ BIỂU ĐIỂM")
        + table(("Câu", "1"), ("Đáp án", "A"))
        + table(("Câu 2. a. Đúng b. Sai", "Trả lời đúng 1 ý: 0,25 điểm Trả lời đúng 2 ý: 1 điểm"))
        + table(("Câu", "Ý", "Đáp án", "Điểm"), ("Câu 1:1 điểm", "", "* Công dụng: Chế tạo.", "1 đ"))
    )


class ExamImportTest(unittest.TestCase):
    def test_imports_official_scores_and_omml(self):
        result = parse_exam(fixture(), "102", 2250)
        doc = result["document"]
        self.assertEqual(doc["examCode"], "102")
        self.assertEqual(doc["declaredExamPageCount"], 2)
        self.assertEqual(doc["subject"], "CÔNG NGHỆ")
        choice, tf, essay = doc["questions"]
        self.assertEqual(choice["options"][0]["text"], "(n_1)/(x)")
        self.assertEqual(choice["answerKey"], "A")
        self.assertEqual(tf["scoringPolicy"]["unitsByCorrectCount"], [0, 250, 1000])
        self.assertEqual(essay["criteria"][0]["maxUnits"], 1000)
        self.assertTrue(all(source_id in result["source"] for q in doc["questions"] for source_id in q["sourceRegionIds"]))

    def test_refuses_mismatched_total(self):
        with self.assertRaisesRegex(ExamImportError, "exam_import_score_mismatch"):
            parse_exam(fixture(), "102", 10000)

    def test_refuses_invalid_docx(self):
        with self.assertRaisesRegex(ExamImportError, "exam_import_invalid_docx"):
            parse_exam("not a docx", "102", 10000)
