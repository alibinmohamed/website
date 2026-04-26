const fs = require('fs');
const file = '/Users/alimutawa/Desktop/CyberclubBestV"workwithit" copy/assets/js/app.js';
let content = fs.readFileSync(file, 'utf8');

const replacement = `function renderTracks() {
  var container = document.querySelector("[data-orbital-tracks]");
  if (!container) return;

  var domains = [
    {
      id: "red", title: "Offensive Security (Red Team)", align: "left", desc: "Simulate attacks to uncover vulnerabilities.",
      paths: [
        { name: "Network Pen Testing", req: [{name:"PNPT", url:"https://certifications.tcm-sec.com/pnpt/"}], des: [{name:"CPENT", url:"#"}] },
        { name: "Web App Security", req: [{name:"eWPT", url:"#"}], des: [{name:"OSWE", url:"#"}] },
        { name: "Exploit Dev / RE", req: [{name:"eCXD", url:"#"}], des: [{name:"OSED", url:"#"}] }
      ]
    },
    {
      id: "blue", title: "Defensive Security (Blue Team)", align: "right", desc: "Defend systems, hunt threats, and respond to incidents.",
      paths: [
        { name: "Security Operations (SOC)", req: [{name:"CyberOps", url:"#"}], des: [{name:"BTL2", url:"#"}] },
        { name: "Digital Forensics & IR", req: [{name:"CHFI", url:"#"}], des: [{name:"GCFA", url:"#"}] },
        { name: "Threat Intelligence", req: [{name:"CTIA", url:"#"}], des: [{name:"FOR578", url:"#"}] }
      ]
    },
    {
      id: "arch", title: "Security Architecture", align: "left", desc: "Design and build secure networks and cloud infrastructure.",
      paths: [
        { name: "Cloud Security", req: [{name:"AWS Security", url:"#"}], des: [{name:"CCSP", url:"#"}] },
        { name: "Network Security", req: [{name:"CCNA", url:"#"}], des: [{name:"CCNP Security", url:"#"}] },
        { name: "DevSecOps", req: [{name:"CSSLP", url:"#"}], des: [{name:"CASS", url:"#"}] }
      ]
    },
    {
      id: "grc", title: "Governance, Risk & Compliance", align: "right", desc: "Manage risk, auditing, and compliance standards.",
      paths: [
        { name: "IT Auditing", req: [{name:"CISA", url:"#"}], des: [{name:"GSNA", url:"#"}] },
        { name: "Risk Management", req: [{name:"CRISC", url:"#"}], des: [{name:"PMI-RMP", url:"#"}] },
        { name: "InfoSec Management", req: [{name:"CISM", url:"#"}], des: [{name:"CISSP-ISSMP", url:"#"}] }
      ]
    }
  ];

  var html = '<div class="spine-root"><h2>Cybersecurity</h2></div>';

  domains.forEach(function(d) {
    var branchClass = d.align === 'right' ? ' right' : '';
    html += '<div class="spine-branch' + branchClass + '">';
    html += '<div class="branch-card">';
    html += '<h3>' + d.title + '</h3><p>' + d.desc + '</p>';
    
    d.paths.forEach(function(path) {
      var reqLinks = path.req.map(function(c) { return '<a href="'+c.url+'" target="_blank" rel="noopener" class="cert-link">'+c.name+'</a>'; }).join("");
      var desLinks = path.des.map(function(c) { return '<a href="'+c.url+'" target="_blank" rel="noopener" class="cert-link">'+c.name+'</a>'; }).join("");
      
      html += '<div class="path-card" onclick="this.classList.toggle(\\\'active\\\')">';
      html += '<div class="path-header"><h4>'+path.name+'</h4><span class="toggle-icon">+</span></div>';
      html += '<div class="path-details">';
      html += '<div class="cert-grid">';
      html += '<div class="cert-box"><strong>Required / Entry</strong>' + reqLinks + '</div>';
      html += '<div class="cert-box"><strong>Desired / Pro</strong>' + desLinks + '</div>';
      html += '</div></div></div>';
    });

    html += '</div></div>';
  });

  container.innerHTML = html;
}`;

// regex to replace the function between function renderTracks() { ... }
content = content.replace(/function renderTracks\(\) \{[\s\S]*?\n\}\n/, replacement + "\n\n");
fs.writeFileSync(file, content);
