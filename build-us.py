# index.html(미나의 하루)로 us/index.html(우리 집, 남편용 공유 앱)을 만든다. index.html을 고친 뒤 실행.
import os
base = os.path.dirname(os.path.abspath(__file__))
s = open(os.path.join(base, 'index.html'), encoding='utf-8').read()
def R(a, b):
    global s
    assert s.count(a) == 1, a
    s = s.replace(a, b)
R('<title>미나의 하루</title>', '<title>우리 집</title>')
R('<meta name="apple-mobile-web-app-title" content="미나의 하루">', '<meta name="apple-mobile-web-app-title" content="우리 집">')
R('<link rel="icon" href="icon-192.png?v=3" type="image/png">', '<link rel="icon" href="icon-192.png?v=1" type="image/png">')
R('<link rel="apple-touch-icon" href="apple-touch-icon.png?v=3">', '<link rel="apple-touch-icon" href="apple-touch-icon.png?v=1">')
R('<div class="brand"><i></i>미나의 하루</div>', '<div class="brand"><i></i>우리 집</div>')
R('<script>\n(function(){', "<script>window.MINA_MODE='us';</script>\n<script>\n(function(){")
open(os.path.join(base, 'us', 'index.html'), 'w', encoding='utf-8').write(s)
print('us/index.html written')
