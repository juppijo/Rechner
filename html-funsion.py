import os

def bundle_web_files():
    # Dateinamen definieren
    html_file = 'index.html'
    js_file = 'script.js'
    css_file = 'style.css'
    output_file = 'main.html'

    # Überprüfen, ob alle Dateien existieren
    for f in [html_file, js_file, css_file]:
        if not os.path.exists(f):
            print(f"Fehler: '{f}' wurde nicht gefunden.")
            return

    # Inhalte einlesen
    with open(html_file, 'r', encoding='utf-8') as f:
        html_content = f.read()
    
    with open(css_file, 'r', encoding='utf-8') as f:
        css_content = f.read()
        
    with open(js_file, 'r', encoding='utf-8') as f:
        js_content = f.read()

    # 1. CSS einbetten: Ersetzt das <link>-Tag für style.css durch <style>...content...</style>
    # Wir suchen nach der Verknüpfung zur style.css
    css_tag = '<link href="style.css" rel="stylesheet"/>'
    if css_tag in html_content:
        html_content = html_content.replace(css_tag, f'<style>\n{css_content}\n</style>')
    else:
        # Falls das Tag leicht anders geschrieben ist, wird es vor </head> eingefügt
        html_content = html_content.replace('</head>', f'<style>\n{css_content}\n</style>\n</head>')

    # 2. JS einbetten: Ersetzt das <script src="..."> Tag durch <script>...content...</script>
    js_tag = '<script src="script.js"></script>'
    if js_tag in html_content:
        html_content = html_content.replace(js_tag, f'<script>\n{js_content}\n</script>')
    else:
        # Falls das Tag nicht exakt so gefunden wird, wird es vor </body> eingefügt
        html_content = html_content.replace('</body>', f'<script>\n{js_content}\n</script>\n</body>')

    # Die neue Datei speichern
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(html_content)

    print(f"Erfolgreich! Die Datei '{output_file}' wurde erstellt.")

if __name__ == "__main__":
    bundle_web_files()
