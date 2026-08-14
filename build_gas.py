import os

def build():
    with open('frontend/index.html', 'r', encoding='utf-8') as f:
        html = f.read()
    with open('frontend/app.js', 'r', encoding='utf-8') as f:
        js = f.read()

    # CSS hiện dùng Tailwind CDN + <style> inline sẵn trong frontend/index.html,
    # nên chỉ còn cần inline JS cho Apps Script (HtmlService không phục vụ file .js rời).
    html = html.replace('<script src="app.js"></script>', f'<script>\n{js}</script>')

    with open('Index.html', 'w', encoding='utf-8') as f:
        f.write(html)
        
    print("Bundle created: Index.html")

if __name__ == '__main__':
    build()
