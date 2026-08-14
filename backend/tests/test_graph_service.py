import networkx as nx

from app.services.graph_service import KnowledgeGraphManager


def _isolated_manager(data_path):
    # Bypass __init__ (which points at the real backend/data path) so tests never
    # touch the actual knowledge_graph.json used by the running app.
    kg = KnowledgeGraphManager.__new__(KnowledgeGraphManager)
    kg.graph = nx.Graph()
    kg._data_path = str(data_path)
    return kg


def test_graph_persists_and_accumulates_across_instances(tmp_path):
    data_path = tmp_path / "graph.json"

    kg1 = _isolated_manager(data_path)
    kg1.add_node("Smith (2023)", title="Paper A", group=1)
    kg1.add_node("Ref1", group=2)
    kg1.add_relation("Smith (2023)", "Ref1", "cites")
    kg1._persist_graph()

    # Simulate the process restarting: a brand new instance loading from disk.
    kg2 = _isolated_manager(data_path)
    kg2._load_graph()
    assert kg2.graph.number_of_nodes() == 2

    kg2.add_node("Doe (2024)", title="Paper B", group=1)
    kg2._persist_graph()

    kg3 = _isolated_manager(data_path)
    kg3._load_graph()
    assert kg3.graph.number_of_nodes() == 3


def test_load_graph_with_no_existing_file_starts_empty(tmp_path):
    kg = _isolated_manager(tmp_path / "does_not_exist.json")
    kg._load_graph()
    assert kg.graph.number_of_nodes() == 0


def test_add_paper_and_references_helper():
    kg = _isolated_manager("unused")
    result_json = {
        "authors": "Grimme, M.",
        "year": "2024",
        "title": "AI in Media Organisations",
        "references": ["Venkatesh & Bala 2008", "Dorr & Hollnbuchner 2017"]
    }

    authors_year = kg.add_paper_and_references(result_json)

    assert authors_year == "Grimme, M. (2024)"
    assert kg.graph.has_node("Grimme, M. (2024)")
    assert kg.graph.has_edge("Grimme, M. (2024)", "Venkatesh & Bala 2008")
    assert kg.graph.number_of_nodes() == 3
