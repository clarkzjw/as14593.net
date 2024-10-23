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
    var isStarlink = false;

    const GEOIP_JSON = "https://raw.githubusercontent.com/clarkzjw/starlink-geoip-data/refs/heads/master/geoip/geoip-latest.json";
    const POP_JSON = "https://raw.githubusercontent.com/clarkzjw/starlink-geoip-data/refs/heads/master/map/pop.json";

    let client_ip = request.headers.get("CF-Connecting-IP");
    if (client_ip !== null) {
      let geoip = await getJson(GEOIP_JSON);
      const popList = await getJson(POP_JSON);

      var pop = "";
      var ptr = "";

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
    }

    let html_content = "";
    let html_style = `
        body {
            padding: 6em;
            font-family: sans-serif;
            display: flex;
            flex-direction: column;
            margin: 0;
        }
        h1 {
            color: #f6821f;
        }
        .content {
            flex: 1;
        }
        .footer {
            text-align: left;
            font-style: italic;
            font-size: 0.8em;
        }
`;

    html_content += "<p> Information about your connection </p>";
    html_content += "<p> IP address: " + request.headers.get("CF-Connecting-IP") + "</p>";
    if (isStarlink) {
      html_content += "<p> You are probably associated with the Starlink PoP: " + pop + "</p>";
      html_content += "<p> Your hostname seems to be: " + ptr + "</p>";
    } else if ([14593, 45700].includes(request.cf.asn) && isStarlink === false) {
      html_content += "<p> You are probably using Starlink, but Starlink does not associate an DNS PTR record with your IP</p>";
      isStarlink = true;
    } else {
      html_content += "<p> You are probably not using Starlink </p>";
    }

    html_content += "<p> ASN: " + request.cf.asn + "</p>";
    html_content += "<p> ASN organization: " + request.cf.asOrganization + "</p>";

    html_content += "<p> HTTP protocol: " + request.cf.httpProtocol + "</p>";

    html_content += "<hr><p> Information about your location (by Cloudflare) </p>";
    // html_content += "<p> Cloudflare edge datacenter: " + request.cf.colo + "</p>";
    html_content += "<p> Continent: " + request.cf.continent + "</p>";
    html_content += "<p> Country: " + request.cf.country + "</p>";
    html_content += "<p> City: " + request.cf.city + "</p>";
    html_content += "<p> Region: " + request.cf.region + "</p>";
    html_content += "<p> Region code: " + request.cf.regionCode + "</p>";
    html_content += "<p> Timezone: " + request.cf.timezone + "</p>";

    let footer = "<p>Powered by Cloudflare Workers. <br>This website is not affiliated with, endorsed by, or in any way connected to Starlink, SpaceX Inc., or any of their subsidiaries.<br>The information on this website is provided as-is and is not guaranteed to be accurate.<br>Source code available at <a href='https://github.com/clarkzjw/as14593.net' target='_blank'>GitHub</a>. </p>";

    let latencyTest = `
    <style>
        #plot {
            display: none;
            width: 1200px;
            height: 400px;
        }
        .mono {
            font-family: "Courier New", Courier, monospace;
            white-space: pre; /* Preserves spaces and line breaks */
            background-color: #f0f0f0; /* Example background color */
            padding: 10px; /* Example padding */
        }
    </style>
    <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
    <script type="module">
    import SpeedTest from 'https://cdn.skypack.dev/@cloudflare/speedtest';

    const controlEl = document.getElementById('controls');
    const resEl = document.getElementById('result');

    const engine = new SpeedTest({
      autoStart: false,
      measurements: [
        { type: 'latency', numPackets: 100 },
      ]
    });

    function isSameSatelliteTimeSlot(t1, t2) {
        // 12, 27, 42, 57
        // if the difference between two timestamps > 15 seconds,
        // they definitely belong to different satellite timeslots
        if ((t2 - t1) / 1000.0 > 15) {
            return false
        }
        let t1_minute = t1.getMinutes();
        let t2_minute = t2.getMinutes();

        // if their minute difference > 1,
        // they definitely belong to different satellite timeslots
        if (t2_minute - t1_minute > 1) {
            return false
        }

        let t1_second = t1.getSeconds();
        let t2_second = t2.getSeconds();

        // if they are in adjacent minutes,
        // and t1 > 57, t2 < 12, they belong to the same timeslot
        if ((t2_minute - t1_minute === 1) && (t1_second > 57 && t2_second <= 12)) {
            return true
        }

        // if they are in the same minute
        if (t1_minute === t2_minute) {
            if (t1_second <= 12 && t2_second <= 12) {
                return true
            }
            if ((t1_second > 12 && t1_second <= 27) && (t2_second > 12 && t2_second <= 27)) {
                return true
            }
            if ((t1_second > 27 && t1_second <= 42) && (t2_second > 27 && t2_second <= 42)) {
                return true
            }
            if ((t1_second > 42 && t1_second <= 57) && (t2_second > 42 && t2_second <= 57)) {
                return true
            }
            if ((t1_second > 57 && t2_second > 57)) {
                return true
            }
        }

        return false
    }

    function plot(latency, first) {
      // for k, v in latency:
      let yValues = [];
      for (const [k, v] of Object.entries(latency)) {
        // remove outliners less than 1
        let vv = v.filter(function(x) { return x > 1; });
        yValues.push(...vv);
      }
      const trace = {
          y: yValues,
          mode: 'markers',
          type: 'scatter'
      };

      const data = [trace];
      const layout = {
          title: 'Latency to Cloudflare edge datacenter',
          yaxis: {
              title: 'RTT (ms)'
          }
      };

      document.getElementById('plot').style.display = 'block';
      Plotly.newPlot('plot', data, layout);
    }

    function calculateLatencyStats(latency) {
      let stats = {};

      for (const [k, v] of Object.entries(latency)) {
        stats[k] = {};
        let vv = v.filter(function(x) { return x > 1; });
        stats[k]["min RTT"] = parseFloat(Math.min(...vv)).toFixed(3);
        stats[k]["max RTT"] = parseFloat(Math.max(...vv)).toFixed(3);
        stats[k]["mean RTT"] = parseFloat(vv.reduce((a, b) => a + b, 0) / vv.length).toFixed(3);
        stats[k]["median RTT"] = parseFloat(vv.sort((a, b) => a - b)[Math.floor(vv.length / 2)]).toFixed(3);
      }
      return stats;
    }

    let metaUrl = "https://speed.cloudflare.com/meta";
    let speedTestColo = "";

    // set duration variable to 2 minutes
    let duration = 2 * 60 * 1000;
    let latencyHistory = {};
    let startTime = new Date();
    let previousTimeslotStart = startTime;

    fetch(metaUrl)
      .then(response => {
        if (!response.ok) {
          throw new Error('Failed to fetch metadata');
        }
        return response.json(); // Ensure you parse the response as JSON if needed
      })
      .then(meta => {
        const metaEl = document.getElementById('meta');
        speedTestColo = meta["colo"];
      })
      .catch(e => {
        console.error(e);
      });

    let intervalId = null;
    let first = true;
    let previousRunning = false;
    let previousIntervalId = null;
    engine.onRunningChange = running => {
        if (running && !previousRunning) {
          previousRunning = true;
          previousIntervalId = setInterval(() => {
            let now = new Date();
            if (!isSameSatelliteTimeSlot(previousTimeslotStart, now)) {
              previousTimeslotStart = now;
              latencyHistory[now.toISOString()] = engine.results.getUnloadedLatencyPoints();
              clearInterval(previousIntervalId);
              engine.restart();

              plot(latencyHistory, first);
              first = false;
            }

            if (now - startTime > duration) {
              console.log('Finished!');
              engine.pause();

              let stats = calculateLatencyStats(latencyHistory);
              controlEl.innerHTML = 'Finished! <br><p class="mono">' + JSON.stringify(stats, null, 2) + '</p>';
              return;
            }

            let info = '(' + now.toISOString() + '): Cloudflare speed test server in ' + speedTestColo + ' is selected...';
            controlEl.innerHTML = info;
        }, 50);
      } else if (!running && previousRunning) {
        previousRunning = false;
        clearInterval(previousIntervalId);
      }
    }

    engine.onFinish = (results) => {
      latencyHistory[previousTimeslotStart.toISOString()] = engine.results.getUnloadedLatencyPoints();
      engine.restart();
    }

    engine.onError = (e) => console.log(e);

    const playButton = document.createElement('button');
    playButton.textContent = "Start Speed Measurement";
    playButton.onclick = () => engine.play();
    controlEl.appendChild(playButton);

    function setResult(obj) {
      const resTxt = document.createElement('pre');
      resTxt.textContent = JSON.stringify(obj, null, 2);
      resEl.textContent = '';
      resEl.appendChild(resTxt);
    }
    </script>
    `;

    let html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Starlink IP Geolocation & Point of Presence (PoP)</title>
    <style>${html_style}</style>
</head>
<body>`;

    if (isStarlink) {
      html += latencyTest;
    }

    html += `<div class="content">
        <h1>Starlink IP Geolocation & Point of Presence (PoP)</h1>
        ${html_content}
    </div>`;

    if (isStarlink) {
      html += `<p>By clicking the button below, latency tests to the nearest Cloudflare edge datacenter are conducted.</p>
<div id="controls"></div>
<div id="result"></div>
<div id="plot"></div>`;
    }

    html += `<div class="footer">
    ${footer}
    <div>
</body>
</html>`;

    return new Response(html, {
      headers: {
        "content-type": "text/html;charset=UTF-8",
      },
    });
  },
};
