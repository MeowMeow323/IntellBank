import json
from app.services.generation_service import generate_full_paper

class DummyRequest:
    def __init__(self):
        self.subject = "Software Project Management"
        self.total_marks = 100
        self.topics = ["Risk", "SQA", "Cost Estimation", "Network Diagram"]
        self.difficulty_distribution = "Standard"

if __name__ == "__main__":
    print("=" * 60)
    print("  Testing Full Exam Paper Orchestration...")
    print("=" * 60)
    
    req = DummyRequest()
    print(f"Subject: {req.subject}")
    print(f"Total Marks: {req.total_marks}")
    print(f"Topics: {req.topics}\n")
    
    print("Calling FLAN-T5 model for sub-questions... (this may take a moment)")
    paper_structure = generate_full_paper(req)
    
    print("\n" + "=" * 60)
    print("  GENERATED PAPER RESULT")
    print("=" * 60)
    print(json.dumps(paper_structure, indent=2))
