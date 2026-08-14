import networkx as nx
from pyvis.network import Network
import html
import json
import os
import re

class KnowledgeGraphManager:
    def __init__(self):
        self.graph = nx.Graph()
        self._data_path = self._get_data_path()
        self._load_graph()

    def _get_data_path(self):
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
        data_dir = os.path.join(base_dir, 'backend', 'data')
        os.makedirs(data_dir, exist_ok=True)
        return os.path.join(data_dir, 'knowledge_graph.json')

    def _load_graph(self):
        # Nạp lại đồ thị đã lưu từ lần chạy trước để dữ liệu được tích lũy
        # thay vì bị ghi đè mỗi khi có tài liệu mới được phân tích.
        if os.path.exists(self._data_path):
            try:
                with open(self._data_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                self.graph = nx.node_link_graph(data, edges="edges")
            except Exception as e:
                print(f"Lỗi khi nạp Knowledge Graph đã lưu, bắt đầu đồ thị mới: {e}")
                self.graph = nx.Graph()

    def _persist_graph(self):
        data = nx.node_link_data(self.graph, edges="edges")
        with open(self._data_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False)

    def add_node(self, node_id, title=None, group="author", year=None, theory=None):
        if not self.graph.has_node(node_id):
            self.graph.add_node(node_id, title=title or node_id, group=group, year=year, theory=theory)

    def add_relation(self, source, target, relation_type, source_group="author", target_group="concept"):
        self.add_node(source, group=source_group)
        self.add_node(target, group=target_group)

        if not self.graph.has_edge(source, target):
            self.graph.add_edge(source, target, label=relation_type)

    def add_paper_and_references(self, result_json: dict):
        # Thêm 1 bài báo cùng danh sách tài liệu tham khảo của nó vào đồ thị.
        # `year` được lưu thành attribute riêng trên node (không chỉ nhét vào label)
        # để generate_timeline_html() có thể sắp xếp theo thời gian.
        year = result_json.get("year", "")
        authors_year = f'{result_json.get("authors", "")} ({year})'
        self.add_node(
            authors_year,
            title=result_json.get("title", ""),
            group=1,
            year=year,
            theory=result_json.get("theory", "")
        )
        for ref in result_json.get("references", []):
            self.add_node(ref, group=2)
            self.add_relation(authors_year, ref, "cites")
        return authors_year

    def generate_html(self, output_path="graph.html"):
        net = Network(height='750px', width='100%', bgcolor='#222222', font_color='white', directed=True)
        net.from_nx(self.graph)
        
        # Cấu hình tuỳ chọn vật lý để đồ thị dễ nhìn hơn
        net.set_options("""
        var options = {
          "physics": {
            "forceAtlas2Based": {
              "gravitationalConstant": -50,
              "centralGravity": 0.01,
              "springLength": 100,
              "springConstant": 0.08
            },
            "minVelocity": 0.75,
            "solver": "forceAtlas2Based"
          }
        }
        """)
        
        net.save_graph(output_path)
        print(f"So do tri thuc da duoc tao tai: {os.path.abspath(output_path)}")

    def generate_timeline_html(self, output_path="timeline.html"):
        # Không dùng thư viện timeline tương tác (vis-timeline) để giảm rủi ro/độ phức
        # tạp - chỉ cần 1 trang tĩnh nhóm các bài báo (group=1) theo năm, sắp xếp tăng
        # dần, giúp thấy lý thuyết/xu hướng nghiên cứu phát triển qua thời gian.
        by_year = {}
        for node_id, attrs in self.graph.nodes(data=True):
            if attrs.get("group") != 1:
                continue
            year_match = re.search(r"\d{4}", str(attrs.get("year") or ""))
            year_key = year_match.group(0) if year_match else "Không rõ năm"
            by_year.setdefault(year_key, []).append({
                "id": node_id,
                "title": attrs.get("title") or "",
                "theory": attrs.get("theory") or ""
            })

        def sort_key(year_key):
            return (0, int(year_key)) if year_key.isdigit() else (1, 0)

        sorted_years = sorted(by_year.keys(), key=sort_key)

        sections = []
        for year_key in sorted_years:
            items_html = ""
            for item in by_year[year_key]:
                title_html = f'<div class="timeline-title">{html.escape(item["title"])}</div>' if item["title"] else ""
                theory_html = f'<div class="timeline-theory">Lý thuyết: {html.escape(item["theory"])}</div>' if item["theory"] else ""
                items_html += f"""
                <div class="timeline-card">
                    <div class="timeline-author">{html.escape(item["id"])}</div>
                    {title_html}
                    {theory_html}
                </div>"""
            sections.append(f"""
            <section class="timeline-year-block">
                <div class="timeline-year-marker">{html.escape(year_key)}</div>
                <div class="timeline-items">{items_html}</div>
            </section>""")

        body = "".join(sections) if sections else '<p class="timeline-empty">Chưa có dữ liệu. Hãy phân tích ít nhất 1 bài báo trước.</p>'

        page = f"""<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<title>Timeline Nghiên cứu</title>
<style>
    body {{ margin: 0; padding: 32px; background: #0f172a; color: #f8fafc; font-family: 'Segoe UI', sans-serif; }}
    h1 {{ font-size: 1.4rem; margin-bottom: 24px; color: #38bdf8; }}
    .timeline-year-block {{ display: flex; gap: 20px; margin-bottom: 28px; align-items: flex-start; }}
    .timeline-year-marker {{ flex-shrink: 0; width: 90px; font-size: 1.3rem; font-weight: 700; color: #38bdf8; padding-top: 6px; }}
    .timeline-items {{ flex: 1; border-left: 2px solid #334155; padding-left: 20px; display: flex; flex-direction: column; gap: 12px; }}
    .timeline-card {{ background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 14px 18px; }}
    .timeline-author {{ font-weight: 600; color: #f8fafc; }}
    .timeline-title {{ color: #cbd5e1; margin-top: 4px; }}
    .timeline-theory {{ color: #94a3b8; margin-top: 4px; font-size: 0.9rem; font-style: italic; }}
    .timeline-empty {{ color: #94a3b8; }}
</style>
</head>
<body>
<h1>📅 Timeline Nghiên cứu</h1>
{body}
</body>
</html>"""

        with open(output_path, "w", encoding="utf-8") as f:
            f.write(page)

    def save_graph(self):
        # Lưu trạng thái đồ thị (để lần sau nạp lại và tích lũy tiếp)
        self._persist_graph()
        # Lưu file HTML đồ thị vào frontend/knowledge_graph.html + timeline vào
        # frontend/knowledge_timeline.html
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
        frontend_dir = os.path.join(base_dir, 'frontend')
        if not os.path.exists(frontend_dir):
            os.makedirs(frontend_dir)
        self.generate_html(os.path.join(frontend_dir, 'knowledge_graph.html'))
        self.generate_timeline_html(os.path.join(frontend_dir, 'knowledge_timeline.html'))
