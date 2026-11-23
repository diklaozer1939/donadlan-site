/* Meta Pixel - דו נדל"ן (מזהה 759915976833869) */
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');

fbq('init', '759915976833869');
fbq('track', 'PageView');

(function () {
  // דף נכס: /n/<id>/
  var m = location.pathname.match(/^\/n\/([\w-]+)\/?$/);
  if (m) {
    fbq('track', 'ViewContent', {
      content_ids: [m[1]],
      content_type: 'home_listing',
      content_name: document.title.replace(/ \| דו נדל"ן$/, '')
    });
  }

  // לחיצה על וואטסאפ או חיוג = ליד
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    var method = /^https:\/\/wa\.me\//.test(href) ? 'whatsapp' : /^tel:/.test(href) ? 'phone' : '';
    if (!method) return;
    var data = { content_category: method };
    if (m) data.content_ids = [m[1]];
    fbq('track', 'Lead', data);
    fbq('track', 'Contact', data);
  }, true);
})();
