import fitz # PyMuPDF
import os

class PDFHighlighter:
    # Bảng màu (RGB normalized 0.0 - 1.0)
    COLORS = {
        "yellow": (1.0, 1.0, 0.0),      # Main Ideas
        "blue": (0.0, 0.0, 1.0),        # Methodology
        "green": (0.0, 1.0, 0.0),       # Findings
        "red": (1.0, 0.0, 0.0),         # Limitations
        "purple": (0.5, 0.0, 0.5),      # Quotes
        "orange": (1.0, 0.64, 0.0)      # Implications
    }

    def highlight_pdf(self, input_path, output_path, highlights_dict):
        """
        highlights_dict format:
        {
            "yellow": ["exact quote 1", "exact quote 2"],
            "blue": ["exact method quote"],
            ...
        }
        """
        if not os.path.exists(input_path):
            raise FileNotFoundError(f"Khong tim thay file {input_path}")
            
        doc = fitz.open(input_path)
        
        for color_name, quotes in highlights_dict.items():
            if not quotes:
                continue
            
            color_rgb = self.COLORS.get(color_name, self.COLORS["yellow"])
            
            for quote in quotes:
                if not quote or len(quote) < 10:
                    continue # Bỏ qua các chuỗi quá ngắn để tránh highlight nhầm
                    
                # Quét từng trang
                for page in doc:
                    # Tìm toạ độ của chuỗi văn bản
                    text_instances = page.search_for(quote)
                    
                    for inst in text_instances:
                        # Thêm annotation highlight
                        highlight = page.add_highlight_annot(inst)
                        highlight.set_colors(stroke=color_rgb)
                        highlight.update()
                        
        doc.save(output_path)
        doc.close()
        print(f"Da tao file highlight thanh cong: {output_path}")
        return output_path
