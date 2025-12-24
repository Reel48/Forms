"""
Smart Chunking Service
Intelligently splits documents into chunks for embedding generation
Preserves context and adds overlap between chunks
"""
import logging
import re
from typing import List, Dict, Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)

DEFAULT_CHUNK_SIZE = 1500  # Target chunk size in characters
DEFAULT_OVERLAP_SIZE = 200  # Overlap between chunks
MIN_CHUNK_SIZE = 200  # Minimum chunk size before merging


@dataclass
class Chunk:
    """Represents a document chunk"""
    text: str
    chunk_index: int
    metadata: Dict


class ChunkingService:
    """Service for intelligently chunking documents"""
    
    def __init__(
        self,
        chunk_size: int = DEFAULT_CHUNK_SIZE,
        overlap_size: int = DEFAULT_OVERLAP_SIZE,
        min_chunk_size: int = MIN_CHUNK_SIZE
    ):
        self.chunk_size = chunk_size
        self.overlap_size = overlap_size
        self.min_chunk_size = min_chunk_size
    
    def chunk_document(
        self,
        text: str,
        metadata: Optional[Dict] = None
    ) -> List[Chunk]:
        """
        Main function to chunk a document intelligently
        
        Args:
            text: Document text to chunk
            metadata: Optional metadata to include with each chunk
            
        Returns:
            List of Chunk objects
        """
        if not text or not text.strip():
            return []
        
        metadata = metadata or {}
        
        # Step 1: Split by paragraphs (double newlines)
        paragraphs = self._split_by_paragraphs(text)
        
        # Step 2: If paragraphs are too large, split further
        processed_paragraphs = []
        for para in paragraphs:
            if len(para) <= self.chunk_size:
                processed_paragraphs.append(para)
            else:
                # Split large paragraphs by sentences
                sentences = self._split_by_sentences(para)
                processed_paragraphs.extend(sentences)
        
        # Step 3: Merge small chunks with adjacent chunks
        merged = self._merge_small_chunks(processed_paragraphs)
        
        # Step 4: Split chunks that are still too large
        final_chunks = []
        for chunk_text in merged:
            if len(chunk_text) <= self.chunk_size:
                final_chunks.append(chunk_text)
            else:
                # Force split by sentences if still too large
                sentences = self._split_by_sentences(chunk_text)
                for sent in sentences:
                    if len(sent) > self.chunk_size:
                        # Last resort: split by words
                        final_chunks.extend(self._split_by_words(sent))
                    else:
                        final_chunks.append(sent)
        
        # Step 5: Add overlap between chunks
        overlapped = self._add_overlap(final_chunks)
        
        # Step 6: Create Chunk objects
        chunks = []
        for idx, chunk_text in enumerate(overlapped):
            if chunk_text.strip():  # Only add non-empty chunks
                chunk_metadata = {
                    **metadata,
                    "chunk_index": idx,
                    "total_chunks": len(overlapped)
                }
                chunks.append(Chunk(
                    text=chunk_text.strip(),
                    chunk_index=idx,
                    metadata=chunk_metadata
                ))
        
        logger.info(f"Created {len(chunks)} chunks from document (avg size: {sum(len(c.text) for c in chunks) // len(chunks) if chunks else 0} chars)")
        return chunks
    
    def _split_by_paragraphs(self, text: str) -> List[str]:
        """Split text by paragraphs (double newlines)"""
        # Split by double newlines (paragraphs)
        paragraphs = re.split(r'\n\s*\n', text)
        return [p.strip() for p in paragraphs if p.strip()]
    
    def _split_by_sentences(self, text: str) -> List[str]:
        """Split text by sentences"""
        # Simple sentence splitting (period, exclamation, question mark followed by space)
        sentences = re.split(r'([.!?]\s+)', text)
        
        # Recombine sentence with its punctuation
        result = []
        i = 0
        while i < len(sentences):
            if i + 1 < len(sentences) and sentences[i + 1].strip() in '.!?':
                result.append(sentences[i] + sentences[i + 1])
                i += 2
            else:
                if sentences[i].strip():
                    result.append(sentences[i])
                i += 1
        
        return [s.strip() for s in result if s.strip()]
    
    def _split_by_words(self, text: str) -> List[str]:
        """Split text by words (last resort for very long text)"""
        words = text.split()
        chunks = []
        current_chunk = []
        current_size = 0
        
        for word in words:
            word_size = len(word) + 1  # +1 for space
            if current_size + word_size > self.chunk_size and current_chunk:
                chunks.append(' '.join(current_chunk))
                current_chunk = [word]
                current_size = word_size
            else:
                current_chunk.append(word)
                current_size += word_size
        
        if current_chunk:
            chunks.append(' '.join(current_chunk))
        
        return chunks
    
    def _merge_small_chunks(self, chunks: List[str]) -> List[str]:
        """Merge chunks smaller than min_chunk_size with adjacent chunks"""
        if not chunks:
            return []
        
        merged = []
        i = 0
        
        while i < len(chunks):
            current = chunks[i]
            
            # If chunk is too small, try to merge with next
            if len(current) < self.min_chunk_size and i + 1 < len(chunks):
                # Merge with next chunk
                merged_chunk = current + "\n\n" + chunks[i + 1]
                # If merged chunk is still reasonable, keep it
                if len(merged_chunk) <= self.chunk_size * 1.5:
                    merged.append(merged_chunk)
                    i += 2
                else:
                    # Too large, just add current and move on
                    merged.append(current)
                    i += 1
            else:
                merged.append(current)
                i += 1
        
        return merged
    
    def _add_overlap(self, chunks: List[str]) -> List[str]:
        """Add overlap between chunks to preserve context"""
        if len(chunks) <= 1:
            return chunks
        
        overlapped = []
        
        for i, chunk in enumerate(chunks):
            if i == 0:
                # First chunk: add overlap from next chunk at the end
                if len(chunks) > 1:
                    next_chunk = chunks[1]
                    overlap_text = next_chunk[:self.overlap_size]
                    if overlap_text:
                        overlapped.append(chunk + "\n\n[Continued: " + overlap_text + "...]")
                    else:
                        overlapped.append(chunk)
                else:
                    overlapped.append(chunk)
            elif i == len(chunks) - 1:
                # Last chunk: add overlap from previous chunk at the start
                prev_chunk = chunks[i - 1]
                overlap_text = prev_chunk[-self.overlap_size:]
                if overlap_text:
                    overlapped.append("[...Continued from: " + overlap_text + "]\n\n" + chunk)
                else:
                    overlapped.append(chunk)
            else:
                # Middle chunks: add overlap from both sides
                prev_chunk = chunks[i - 1]
                next_chunk = chunks[i + 1]
                
                prev_overlap = prev_chunk[-self.overlap_size:]
                next_overlap = next_chunk[:self.overlap_size]
                
                overlapped_text = ""
                if prev_overlap:
                    overlapped_text += "[...Continued from: " + prev_overlap + "]\n\n"
                overlapped_text += chunk
                if next_overlap:
                    overlapped_text += "\n\n[Continued: " + next_overlap + "...]"
                
                overlapped.append(overlapped_text)
        
        return overlapped


# Singleton instance
_chunking_service: Optional[ChunkingService] = None


def get_chunking_service() -> ChunkingService:
    """Get or create chunking service instance"""
    global _chunking_service
    if _chunking_service is None:
        _chunking_service = ChunkingService()
    return _chunking_service

