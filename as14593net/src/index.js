function ipToNumArray(ip) {
  if (ip.includes(':')) { // IPv6
    const segments = ip.split(':').map(seg => parseInt(seg, 16));
    while (segments.length < 8) {
      const idx = segments.indexOf(0);
      segments.splice(idx, 1, 0, 0);
    }
    return segments;
  } else { // IPv4
    return ip.split('.').map(Number);
  }
}

function createMask(maskLength, totalBits) {
  const mask = [];
  for (let i = 0; i < totalBits; i++) {
    if (maskLength > 0) {
      maskLength--;
      mask.push(1);
    } else {
      mask.push(0);
    }
  }
  return mask;
}

function applyMask(ipSegments, mask) {
  return ipSegments.map((seg, i) => seg & mask[i]);
}

function ipInSubnet(ip, subnet) {
  const [subnetIp, maskLength] = subnet.split('/');
  const ipType = ip.includes(':') ? 'ipv6' : 'ipv4';

  const totalBits = ipType === 'ipv6' ? 128 : 32;
  const segmentBits = ipType === 'ipv6' ? 16 : 8;

  const subnetSegments = ipToNumArray(subnetIp);
  const ipSegments = ipToNumArray(ip);
  const mask = createMask(parseInt(maskLength), totalBits).reduce((acc, bit, i) => {
    const idx = Math.floor(i / segmentBits);
    acc[idx] = (acc[idx] || 0) << 1 | bit;
    return acc;
  }, []);

  const subnetWithMask = applyMask(subnetSegments, mask);
  const ipWithMask = applyMask(ipSegments, mask);

  return subnetWithMask.every((seg, i) => seg === ipWithMask[i]);
}

async function getJson(url) {
  try {
    const response = await fetch(
      url,
      { method: 'GET' }
    );
    return response.json();
  } catch (err) {
    throw new Error(err);
  }
}

export default {
  async fetch(request) {
    const GEOIP_JSON = "https://raw.githubusercontent.com/clarkzjw/starlink-geoip-data/refs/heads/master/geoip/geoip-latest.json";
    const POP_JSON = "https://raw.githubusercontent.com/clarkzjw/starlink-geoip-data/refs/heads/master/map/pop.json";

    let client_ip = request.headers.get("CF-Connecting-IP");

    let geoip = await getJson(GEOIP_JSON);
    const popList = await getJson(POP_JSON);

    var isStarlink = false;
    var pop = "";
    var ptr = "";
    var isStarlink = false;

    geoip = geoip["valid"];
    for (var country in geoip) {
      for (var region in geoip[country]) {
        for (var city in geoip[country][region]) {
          for (var i = 0; i < geoip[country][region][city].ips.length; i++) {
            if (ipInSubnet(client_ip, geoip[country][region][city].ips[i][0])) {
              isStarlink = true;
              ptr = geoip[country][region][city].ips[i][1];
              pop = popList.find(x => x.code === ptr.split('.')[1]).city;
              isStarlink = true;
              break;
            }
          }
        }
      }
    }

    let html_content = "";
    let html_style = `
      body {
            padding: 6em;
            font-family: sans-serif;
            display: flex;
            flex-direction: column;
            min-height: 100vh;
            margin: 0;
        }
        h1 {
            color: #f6821f;
        }
        .content {
            flex: 1;
        }
        footer {
            text-align: center; /* Center the footer content */
        }
    `;

    html_content += "<p> Information about your connection </p>";
    html_content += "<p> IP address: " + request.headers.get("CF-Connecting-IP") + "</p>";
    if (isStarlink) {
      html_content += "<p> You are probably associated with Starlink PoP: " + pop + "</p>";
      html_content += "<p> Your hostname: " + ptr + "</p>";
    } else {
      html_content += "<p> You are probably not using Starlink </p>";
    }

    html_content += "<p> ASN: " + request.cf.asn + "</p>";
    html_content += "<p> ASN Organization: " + request.cf.asOrganization + "</p>";

    html_content += "<p> HTTP Protocol: " + request.cf.httpProtocol + "</p>";

    html_content += "<hr><p> Information about your location (by Cloudflare) </p>";
    html_content += "<p> Continent: " + request.cf.continent + "</p>";
    html_content += "<p> Country: " + request.cf.country + "</p>";
    html_content += "<p> City: " + request.cf.city + "</p>";
    html_content += "<p> Region: " + request.cf.region + "</p>";
    html_content += "<p> Region Code: " + request.cf.regionCode + "</p>";
    html_content += "<p> Timezone: " + request.cf.timezone + "</p>";

    let footer = "<p> This website runs on Cloudflare Workers. <br>Source code available at <a href='https://github.com/clarkzjw/as14593.net' target='_blank'>GitHub</a>. </p>";

    let html = `<!DOCTYPE html>
    <html lang="en">
    <head>
        <title>Geolocation: Hello World</title>
        <style>${html_style}</style>
    </head>
    <body>
        <div class="content">
            <h1>Starlink Point of Presence (PoP) Geolocation</h1>
            ${html_content}
        </div>
        ${footer}
    </body>
    </html>`;

    return new Response(html, {
      headers: {
        "content-type": "text/html;charset=UTF-8",
      },
    });
  },
};
