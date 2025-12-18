/**
 * Generate HTML error page for invalid offers
 */

export function generateOfferErrorPage(errorMessage, errorType) {
  const title = getErrorTitle(errorType);
  const description = getErrorDescription(errorType, errorMessage);

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            max-width: 500px;
            width: 100%;
            padding: 40px;
            text-align: center;
        }
        .icon {
            width: 80px;
            height: 80px;
            margin: 0 auto 20px;
            background: #fee;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 40px;
        }
        h1 {
            color: #333;
            font-size: 24px;
            margin-bottom: 12px;
            font-weight: 600;
        }
        p {
            color: #666;
            font-size: 16px;
            line-height: 1.6;
            margin-bottom: 8px;
        }
        .error-code {
            color: #999;
            font-size: 14px;
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid #eee;
        }
        .button {
            display: inline-block;
            margin-top: 24px;
            padding: 12px 24px;
            background: #667eea;
            color: white;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 500;
            transition: background 0.3s;
        }
        .button:hover {
            background: #5568d3;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">⚠️</div>
        <h1>${title}</h1>
        <p>${description}</p>
        <div class="error-code">
            ${errorMessage}
        </div>
        <a href="javascript:history.back()" class="button">Go Back</a>
    </div>
</body>
</html>`;
}

function getErrorTitle(errorType) {
  const titles = {
    'offer_not_found': 'Offer Not Found',
    'offer_not_live': 'Offer Not Available',
    'offer_expired': 'Offer Expired',
    'offer_not_started': 'Offer Not Started',
    'offer_time_restricted': 'Offer Temporarily Unavailable',
  };
  return titles[errorType] || 'Offer Unavailable';
}

function getErrorDescription(errorType, errorMessage) {
  const descriptions = {
    'offer_not_found': 'The offer you are looking for does not exist or has been removed.',
    'offer_not_live': 'This offer is currently not active. Please check back later or contact support.',
    'offer_expired': 'This offer has expired and is no longer accepting traffic.',
    'offer_not_started': 'This offer has not started yet. Please check back later.',
    'offer_time_restricted': 'This offer is not available at the current time. Please try again during the allowed time window.',
  };
  return descriptions[errorType] || 'This offer is currently unavailable. Please try again later.';
}
