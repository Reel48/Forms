"""
Smart Chunking Service
Intelligently splits documents into chunks for embedding generation
Creates larger, more meaningful chunks with better context preservation
"""
import logging
import re
from typing import List, Dict, Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)

DEFAULT_CHUNK_SIZE = 3000  # Target chunk size in characters
DEFAULT_OVERLAP_SIZE = 200  # Overlap between chunks (deprecated - no longer used)
MIN_CHUNK_SIZE = 500  # Minimum chunk size before merging


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
        
        # Step 2: Process paragraphs - prefer keeping them together
        processed_chunks = []
        for para in paragraphs:
            if len(para) <= self.chunk_size:
                # Paragraph fits in one chunk - keep it whole
                processed_chunks.append(para)
            else:
                # Paragraph is too large - split by sentences but try to keep groups together
                sentences = self._split_by_sentences(para)
                # Group sentences into chunks that approach but don't exceed chunk_size
                current_group = []
                current_size = 0
                
                for sent in sentences:
                    sent_size = len(sent)
                    # If adding this sentence would exceed chunk_size, finalize current group
                    if current_size + sent_size > self.chunk_size and current_group:
                        processed_chunks.append(' '.join(current_group))
                        current_group = [sent]
                        current_size = sent_size
                    else:
                        current_group.append(sent)
                        current_size += sent_size + 1  # +1 for space
                
                # Add remaining group
                if current_group:
                    processed_chunks.append(' '.join(current_group))
        
        # Step 3: Merge small chunks with adjacent chunks (more aggressive merging)
        merged = self._merge_small_chunks(processed_chunks)
        
        # Step 4: Final pass - split any chunks that are still too large
        final_chunks = []
        for chunk_text in merged:
            if len(chunk_text) <= self.chunk_size:
                final_chunks.append(chunk_text)
            else:
                # Chunk is still too large - split by sentences
                sentences = self._split_by_sentences(chunk_text)
                current_group = []
                current_size = 0
                
                for sent in sentences:
                    sent_size = len(sent)
                    if current_size + sent_size > self.chunk_size and current_group:
                        final_chunks.append(' '.join(current_group))
                        current_group = [sent]
                        current_size = sent_size
                    else:
                        current_group.append(sent)
                        current_size += sent_size + 1
                
                if current_group:
                    # Only split by words if a single sentence exceeds chunk_size
                    if len(' '.join(current_group)) > self.chunk_size:
                        final_chunks.extend(self._split_by_words(' '.join(current_group)))
                    else:
                        final_chunks.append(' '.join(current_group))
        
        # Step 5: Create Chunk objects (no overlap - store clean chunks)
        chunks = []
        for idx, chunk_text in enumerate(final_chunks):
            cleaned_text = chunk_text.strip()
            if cleaned_text:  # Only add non-empty chunks
                chunk_metadata = {
                    **metadata,
                    "chunk_index": idx,
                    "total_chunks": len(final_chunks)
                }
                chunks.append(Chunk(
                    text=cleaned_text,
                    chunk_index=idx,
                    metadata=chunk_metadata
                ))
        
        avg_size = sum(len(c.text) for c in chunks) // len(chunks) if chunks else 0
        logger.info(f"Created {len(chunks)} chunks from document (avg size: {avg_size} chars, target: {self.chunk_size})")
        return chunks
    
    def _split_by_paragraphs(self, text: str) -> List[str]:
        """Split text by paragraphs (double newlines)"""
        # Split by double newlines (paragraphs)
        paragraphs = re.split(r'\n\s*\n', text)
        return [p.strip() for p in paragraphs if p.strip()]
    
    def _split_by_sentences(self, text: str) -> List[str]:
        """Split text by sentences with better handling of edge cases"""
        # Improved sentence splitting - handle abbreviations, decimals, etc.
        # Split on sentence endings followed by space and capital letter or end of text
        # This regex handles: . ! ? followed by space and capital, or end of string
        sentences = re.split(r'([.!?]+)\s+(?=[A-Z]|$)', text)
        
        # Recombine sentence with its punctuation
        result = []
        i = 0
        while i < len(sentences):
            if i + 1 < len(sentences) and sentences[i + 1].strip() and re.match(r'^[.!?]+$', sentences[i + 1].strip()):
                # Combine sentence with its punctuation
                combined = sentences[i] + sentences[i + 1]
                if i + 2 < len(sentences):
                    # Add space before next sentence if it starts with capital
                    if sentences[i + 2] and sentences[i + 2][0].isupper():
                        combined += ' '
                result.append(combined)
                i += 2
            else:
                if sentences[i].strip():
                    result.append(sentences[i])
                i += 1
        
        # Filter out empty sentences and clean whitespace
        cleaned = [s.strip() for s in result if s.strip()]
        
        # If no sentences found (e.g., single line without punctuation), return as single sentence
        if not cleaned:
            return [text.strip()] if text.strip() else []
        
        return cleaned
    
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
        """Merge chunks smaller than min_chunk_size with adjacent chunks (aggressive merging)"""
        if not chunks:
            return []
        
        merged = []
        i = 0
        
        while i < len(chunks):
            current = chunks[i]
            
            # If chunk is too small, try to merge with next chunks
            if len(current) < self.min_chunk_size:
                # Try to merge with as many following chunks as possible
                merged_chunk = current
                j = i + 1
                
                while j < len(chunks) and len(merged_chunk) < self.chunk_size:
                    next_chunk = chunks[j]
                    potential_merge = merged_chunk + "\n\n" + next_chunk
                    
                    # If merged chunk would still be reasonable, add it
                    if len(potential_merge) <= self.chunk_size * 1.2:
                        merged_chunk = potential_merge
                        j += 1
                    else:
                        break
                
                merged.append(merged_chunk)
                i = j
            else:
                merged.append(current)
                i += 1
        
        return merged


# Singleton instance
_chunking_service: Optional[ChunkingService] = None


def get_chunking_service() -> ChunkingService:
    """Get or create chunking service instance"""
    global _chunking_service
    if _chunking_service is None:
        _chunking_service = ChunkingService()
    return _chunking_service

