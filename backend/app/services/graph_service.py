import networkx as nx
from pyvis.network import Network
import json
import os

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

    def add_node(self, node_id, title=None, group="author"):
        if not self.graph.has_node(node_id):
            self.graph.add_node(node_id, title=title or node_id, group=group)

    def add_relation(self, source, target, relation_type, source_group="author", target_group="concept"):
        self.add_node(source, group=source_group)
        self.add_node(target, group=target_group)

        if not self.graph.has_edge(source, target):
            self.graph.add_edge(source, target, label=relation_type)

    def add_paper_and_references(self, result_json: dict):
        # Thêm 1 bài báo cùng danh sách tài liệu tham khảo của nó vào đồ thị.
        authors_year = f'{result_json.get("authors", "")} ({result_json.get("year", "")})'
        self.add_node(authors_year, title=result_json.get("title", ""), group=1)
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
        
    def save_graph(self):
        # Lưu trạng thái đồ thị (để lần sau nạp lại và tích lũy tiếp)
        self._persist_graph()
        # Lưu file HTML đồ thị vào frontend/knowledge_graph.html
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
        frontend_dir = os.path.join(base_dir, 'frontend')
        if not os.path.exists(frontend_dir):
            os.makedirs(frontend_dir)
        self.generate_html(os.path.join(frontend_dir, 'knowledge_graph.html'))
