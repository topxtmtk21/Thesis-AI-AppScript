import os

def build():
    with open('frontend/index.html', 'r', encoding='utf-8') as f:
        html = f.read()
    with open('frontend/style.css', 'r', encoding='utf-8') as f:
        css = f.read()
    with open('frontend/app.js', 'r', encoding='utf-8') as f:
        js = f.read()

    # Thay thế thẻ link CSS bằng thẻ style chứa nội dung
    html = html.replace('<link rel="stylesheet" href="style.css">', f'<style>\n{css}\n</style>')
    # Thay thế thẻ script JS bằng nội dung JS
    html = html.replace('<script src="app.js"></script>', f'<script>\n{js}\n</script>')

    with open('Index.html', 'w', encoding='utf-8') as f:
        f.write(html)
        
    print("Bundle created: Index.html")

if __name__ == '__main__':
    build()
