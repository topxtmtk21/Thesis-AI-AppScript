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
            "yellow": ["exact quote 1 (p. 15)", "exact quote 2 (p. 2)"],
            "blue": ["exact method quote (p. 10)"],
            ...
        }
        """
        import re
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
                    
                # Extract page number using regex, e.g., (p. 15) or (page 15)
                page_match = re.search(r'\((?:p\.|page)\s*(\d+)\)\s*$', quote, re.IGNORECASE)
                
                search_text = quote
                target_page_idx = -1
                
                if page_match:
                    try:
                        # doc pages are 0-indexed, so subtract 1
                        target_page_idx = int(page_match.group(1)) - 1
                        # Remove the page number part from the search string to match the raw text
                        search_text = quote[:page_match.start()].strip()
                    except ValueError:
                        pass
                
                if target_page_idx >= 0 and target_page_idx < len(doc):
                    # Search only on the specified page
                    pages_to_search = [doc[target_page_idx]]
                else:
                    # Fallback to searching all pages if page number is missing or invalid
                    pages_to_search = doc
                    
                for page in pages_to_search:
                    text_instances = page.search_for(search_text)
                    for inst in text_instances:
                        highlight = page.add_highlight_annot(inst)
                        highlight.set_colors(stroke=color_rgb)
                        highlight.update()
                        
        doc.save(output_path)
        doc.close()
        print(f"Da tao file highlight thanh cong: {output_path}")
        return output_path
