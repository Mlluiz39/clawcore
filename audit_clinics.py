import urllib.request
import urllib.parse
import ssl
import time
import re
import json

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

headers = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1'
}

clinics = [
    {"name": "Mitras Estética", "site": "https://mitrasestetica.com.br", "phone": "+55 11 92627-7735", "addr": "Rua Vergueiro, 2045 - Vila Mariana"},
    {"name": "Pró Estética", "site": "https://proesteticaoficial.com.br", "phone": "+55 11 97444-5843", "addr": "Rua Desembargador do Vale, 219 - Perdizes"},
    {"name": "ZAY Dermatologia e Estética", "site": "http://www.zayestetica.com.br", "phone": "+55 11 96229-6053", "addr": "R. Emílio de Menezes, 76 - Santa Cecilia"},
    {"name": "Shape Clinic", "site": "https://www.shapeclinic.com.br", "phone": "+55 11 3085-2344", "addr": "Av. Paulista, 2202 - Cerqueira César"},
    {"name": "Botocenter Jardins", "site": "https://www.botocenter.com.br", "phone": "+55 11 98835-7985", "addr": "Alameda Santos, 880 - Jardim Paulista"},
    {"name": "Dra. Flávia Pina", "site": "https://drflaviapina.com.br", "phone": "+55 11 99716-2014", "addr": "R. Borges de Figueiredo, 303 - Mooca"},
    {"name": "Clínica Jessica Leistayo", "site": "https://jessicaleistayo.com", "phone": "+55 11 93438-4016", "addr": "R. Maurício Francisco Klabin, 205 - Vila Mariana"},
    {"name": "Clínica Oscar Freire", "site": "https://clinicaoscarfreire.com.br", "phone": "+55 11 2362-8104", "addr": "R. Oscar Freire, 530 - Cerqueira César"},
    {"name": "Central da Estética", "site": "https://www.centraldaestetica.com.br", "phone": "+55 11 3051-2433", "addr": "R. Artur Frazão, 33 - Jardim Paulista"},
    {"name": "Dra Poly Harmonização Facial", "site": "https://drapolyharmonizacaofacial.com.br", "phone": "+55 11 96924-7340", "addr": "R. Min. Gabriel de Rezende Passos, 500 - Moema"},
    {"name": "Zahra Estética & Spa", "site": "http://www.zahra.com.br", "phone": "+55 11 5096-0610", "addr": "Av. Cotovia, 261 - Vila Uberabinha"},
    {"name": "Santbeauty", "site": "http://www.santbeauty.com.br", "phone": "+55 11 95420-5623", "addr": "R. Pamplona, 311 - Jardim Paulista"},
    {"name": "Clínica Biavatti Jardins", "site": "https://www.clinicabiavatti.com.br", "phone": "+55 11 91705-7325", "addr": "R. Antônio Carlos, 696 - Consolação"},
    {"name": "Pró-Corpo Estética Avançada", "site": "https://www.procorpoestetica.com.br", "phone": "+55 11 4450-3626", "addr": "R. Augusta, 2677 - Cerqueira César"},
    {"name": "Clínica Jardins SP", "site": "https://clinicajardinssp.com.br", "phone": "+55 11 97416-6811", "addr": "Alameda Joaquim Eugênio de Lima, 1286 - Jardim Paulista"},
    {"name": "Clínica Tay Akemi", "site": "https://tayakemiestetica.com", "phone": "+55 11 94530-7204", "addr": "Av. Nove de Julho, 3384 - Jardim Paulista"},
    {"name": "Clínica Wulkan", "site": "https://clinicawulkan.com.br", "phone": "+55 11 94084-3728", "addr": "Alameda Joaquim Eugênio de Lima, 1674 - Jardins"}
]

results = []

for c in clinics:
    url = c["site"]
    t0 = time.time()
    res = {
        "name": c["name"],
        "url": url,
        "phone": c["phone"],
        "addr": c["addr"],
        "status": None,
        "response_time_ms": None,
        "meta_pixel": False,
        "google_analytics": False,
        "google_tag_manager": False,
        "has_viewport": False,
        "cnpj": None,
        "pixel_ids": []
    }
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=10, context=ctx) as response:
            latency = int((time.time() - t0) * 1000)
            res["status"] = response.status
            res["response_time_ms"] = latency
            html = response.read().decode('utf-8', errors='ignore')
            
            # Viewport
            if 'name="viewport"' in html.lower() or "name='viewport'" in html.lower():
                res["has_viewport"] = True
                
            # Meta Pixel
            if 'fbq(' in html or 'fbevents.js' in html or 'connect.facebook.net' in html:
                res["meta_pixel"] = True
            
            # Pixel IDs
            fb_ids = re.findall(r"fbq\([\'\"]init[\'\"],\s*[\'\"](\d+)[\'\"]\)", html)
            if fb_ids:
                res["pixel_ids"] = list(set(fb_ids))
                res["meta_pixel"] = True
                
            # GTM / GA
            if 'googletagmanager.com/gtm.js' in html or 'gtm-' in html.lower():
                res["google_tag_manager"] = True
            if 'google-analytics.com' in html or 'gtag(' in html:
                res["google_analytics"] = True
                
            # CNPJ
            cnpjs = re.findall(r"\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}", html)
            if cnpjs:
                res["cnpj"] = cnpjs[0]
                
    except Exception as e:
        res["error"] = str(e)
    results.append(res)

print(json.dumps(results, indent=2, ensure_ascii=False))
