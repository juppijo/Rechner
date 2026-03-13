import os
from bs4 import BeautifulSoup

def split_html_file(input_file):
    if not os.path.exists(input_file):
        print(f"Fehler: Die Datei '{input_file}' wurde nicht gefunden.")
        return

    with open(input_file, 'r', encoding='utf-8') as f:
        soup = BeautifulSoup(f, 'html.parser')

    # 1. Extrahiere CSS
    style_tag = soup.find('style')
    css_content = style_tag.string if style_tag else "/* Kein CSS gefunden */"
    if style_tag:
        style_tag.decompose() # Entferne das Tag aus dem HTML

    # 2. Extrahiere JavaScript
    script_tag = soup.find('script', src=False) # Nur interne Scripts ohne 'src'
    js_content = script_tag.string if script_tag else "// Kein JavaScript gefunden"
    if script_tag:
        script_tag.decompose() # Entferne das Tag aus dem HTML

    # 3. Referenzen im HTML hinzufügen
    # CSS im <head> verlinken
    if soup.head:
        new_link = soup.new_tag("link", rel="stylesheet", href="style.css")
        soup.head.append(new_link)
    
    # JS am Ende des <body> verlinken
    if soup.body:
        new_script = soup.new_tag("script", src="script.js")
        soup.body.append(new_script)

    # 4. Dateien schreiben
    with open('index.html', 'w', encoding='utf-8') as f:
        f.write(soup.prettify())

    with open('style.css', 'w', encoding='utf-8') as f:
        f.write(css_content.strip())

    with open('script.js', 'w', encoding='utf-8') as f:
        f.write(js_content.strip())

    print("Erfolgreich aufgeteil in: index.html, style.css, script.js")

if __name__ == "__main__":
    split_html_file('musik-touch-pro.html')
