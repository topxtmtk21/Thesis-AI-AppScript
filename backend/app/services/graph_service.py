import networkx as nx
from pyvis.network import Network
import os

class KnowledgeGraphManager:
    def __init__(self):
        self.graph = nx.Graph()

    def add_node(self, node_id, title=None, group="author"):
        if not self.graph.has_node(node_id):
            self.graph.add_node(node_id, title=title or node_id, group=group)

    def add_relation(self, source, target, relation_type, source_group="author", target_group="concept"):
        self.add_node(source, group=source_group)
        self.add_node(target, group=target_group)
            
        if not self.graph.has_edge(source, target):
            self.graph.add_edge(source, target, label=relation_type)

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
        # Lưu file HTML đồ thị vào frontend/knowledge_graph.html
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
        frontend_dir = os.path.join(base_dir, 'frontend')
        if not os.path.exists(frontend_dir):
            os.makedirs(frontend_dir)
        self.generate_html(os.path.join(frontend_dir, 'knowledge_graph.html'))
