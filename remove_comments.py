#!/usr/bin/env python3
import re
import sys

def remove_comments(content):
    """Remove single-line and multi-line comments from TypeScript/JavaScript code."""
    
    # Remove multi-line comments /* ... */
    content = re.sub(r'/\*[\s\S]*?\*/', '', content)
    
    # Remove single-line comments //
    # But preserve URLs like http:// and https://
    content = re.sub(r'(?<!:)//(?!//).*?$', '', content, flags=re.MULTILINE)
    
    # Clean up empty lines (optional - remove triple+ empty lines)
    content = re.sub(r'\n\s*\n\s*\n+', '\n\n', content)
    
    return content

def main():
    if len(sys.argv) != 2:
        print("Usage: python remove_comments.py <file>")
        sys.exit(1)
    
    filepath = sys.argv[1]
    
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        cleaned = remove_comments(content)
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(cleaned)
        
        print(f"✓ Comments removed from {filepath}")
    
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
