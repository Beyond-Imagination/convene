// CloudFront Function (viewer-request) — 정적 export(out/) 라우팅 보정.
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  // 정적 자산(확장자 포함)은 그대로 통과
  if (uri.includes('.')) {
    return request;
  }
  // 동적 라우트 → 빌드된 placeholder HTML
  if (/^\/meetings\/[^/]+\/?$/.test(uri)) {
    request.uri = '/meetings/placeholder/index.html';
  } else if (/^\/reports\/[^/]+\/?$/.test(uri)) {
    request.uri = '/reports/placeholder/index.html';
  } else if (uri.endsWith('/')) {
    request.uri = uri + 'index.html';
  } else {
    request.uri = uri + '/index.html';
  }
  return request;
}
