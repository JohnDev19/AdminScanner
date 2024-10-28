from flask import Flask, render_template, request, jsonify, Response
import requests
from urllib.parse import urljoin
import concurrent.futures
import re
import json
import logging
from requests.exceptions import RequestException
from functools import lru_cache

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)

# Admin paths
@lru_cache(maxsize=1)
def load_wordlist():
    try:
        with open('wordlists/admin_paths.txt', 'r') as f:
            return [line.strip() for line in f if line.strip()]
    except FileNotFoundError:
        logging.error("Admin paths wordlist not found.")
        return []

# If URL is valid
def is_valid_url(url):
    url_pattern = re.compile(
        r'^https?://'
        r'(?:(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,6}\.?|'
        r'localhost|'
        r'\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})'
        r'(?::\d+)?'
        r'(?:/?|[/?]\S+)$', re.IGNORECASE)
    return bool(url_pattern.match(url))

# Single admin path
def check_admin_path(base_url, path, timeout=5):
    try:
        url = urljoin(base_url, path)
        response = requests.get(url, timeout=timeout, allow_redirects=False)
        return {
            'path': path,
            'url': url,
            'status': response.status_code,
            'result': 'OK' if response.status_code == 200 else 'NO',
            'content_type': response.headers.get('Content-Type', '')
        }
    except RequestException as e:
        return {
            'path': path,
            'url': urljoin(base_url, path),
            'status': 'ERROR',
            'result': 'NO',
            'error': str(e)
        }

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/scan', methods=['POST'])
def scan():
    data = request.get_json()
    target_url = data.get('url')

    if not target_url:
        return jsonify({'error': 'No URL provided'}), 400

    if not is_valid_url(target_url):
        return jsonify({'error': 'Invalid URL format'}), 400

    # Normalize URL
    if not target_url.startswith(('http://', 'https://')):
        target_url = 'http://' + target_url

    wordlist = load_wordlist()
    if not wordlist:
        return jsonify({'error': 'Admin paths wordlist is empty or not found'}), 500

    def generate():
        yield json.dumps({'message': f'Starting scan for: {target_url}\n'}) + '\n'

        found_panels = []
        total_paths = len(wordlist)
        paths_checked = 0

        with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
            future_to_url = {executor.submit(check_admin_path, target_url, path): path for path in wordlist}

            for future in concurrent.futures.as_completed(future_to_url):
                result = future.result()
                paths_checked += 1
                progress = (paths_checked / total_paths) * 100

                if result['result'] == 'OK':
                    found_panels.append(result)

                yield json.dumps({
                    'message': f"[{result['result']}] {result['url']} (Status: {result['status']})\n",
                    'type': 'log',
                    'result': result['result'],
                    'progress': progress
                }) + '\n'

        yield json.dumps({'message': f'Scan completed. Found {len(found_panels)} admin panels.\n'}) + '\n'
        yield json.dumps({'type': 'complete', 'found_panels': found_panels}) + '\n'

    return Response(generate(), content_type='application/json')

@app.errorhandler(Exception)
def handle_exception(e):
    logging.error(f"An error occurred: {str(e)}")
    return jsonify({'error': 'An internal server error occurred'}), 500

if __name__ == '__main__':
    app.run(debug=True)