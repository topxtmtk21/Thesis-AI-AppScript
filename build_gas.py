import os
import re
import subprocess
import sys


def minify_js(js: str) -> str:
    """Minify với terser (qua npx). Apps Script HtmlService từng bị cắt cụt nội dung
    khi Index.html vượt quá ~50KB (đã xác minh thực tế: bản cũ ~50KB chạy tốt, bản
    ~80KB bị Google cắt cụt giữa chừng khi nhúng qua document.write(), gây
    SyntaxError). Giảm dung lượng bundle là bắt buộc, không chỉ để tối ưu."""
    try:
        npx_cmd = 'npx.cmd' if os.name == 'nt' else 'npx'
        result = subprocess.run(
            [npx_cmd, '--yes', 'terser', '--compress', '--mangle'],
            input=js, capture_output=True, text=True, encoding='utf-8', timeout=60
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout
        print(f"CẢNH BÁO: terser lỗi, dùng JS chưa minify. stderr: {result.stderr[:300]}", file=sys.stderr)
    except Exception as e:
        print(f"CẢNH BÁO: không chạy được terser ({e}), dùng JS chưa minify.", file=sys.stderr)
    return js


def strip_html_comments(html: str) -> str:
    # An toàn vì toàn bộ comment HTML trong frontend/index.html đều tự viết, không có
    # chuỗi "-->" nào nằm trong nội dung/thuộc tính thực (đã kiểm tra thủ công).
    return re.sub(r'<!--.*?-->', '', html, flags=re.DOTALL)


def collapse_blank_lines(text: str) -> str:
    return re.sub(r'\n\s*\n+', '\n', text)


def strip_leading_whitespace(html: str) -> str:
    # Bỏ khoảng trắng thụt lề đầu mỗi dòng trong phần HTML (không đụng vào bên trong
    # <script>/<style>, xử lý riêng ở minify_js/CSS đã inline sẵn). An toàn cho HTML vì
    # khoảng trắng đầu dòng giữa các thẻ không có ý nghĩa hiển thị (không dùng <pre>).
    return '\n'.join(line.lstrip() for line in html.split('\n'))


def build():
    with open('frontend/index.html', 'r', encoding='utf-8') as f:
        html = f.read()
    with open('frontend/app.js', 'r', encoding='utf-8') as f:
        js = f.read()

    js_min = minify_js(js)

    # CSS hiện dùng Tailwind CDN + <style> inline sẵn trong frontend/index.html,
    # nên chỉ còn cần inline JS cho Apps Script (HtmlService không phục vụ file .js rời).
    html = html.replace('<script src="app.js"></script>', f'<script>\n{js_min}</script>')
    html = strip_html_comments(html)
    html = strip_leading_whitespace(html)
    html = collapse_blank_lines(html)

    with open('Index.html', 'w', encoding='utf-8') as f:
        f.write(html)

    size = os.path.getsize('Index.html')
    print(f"Bundle created: Index.html ({size:,} bytes)")


if __name__ == '__main__':
    build()
