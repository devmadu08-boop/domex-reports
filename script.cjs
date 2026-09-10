const fs = require('fs');
let code = fs.readFileSync('src/components/dispatch/DispatchShareCard.jsx', 'utf8');

code = code.replace(
  'const containerRef = useRef(null);',
  'const containerRef = useRef(null);\n  const exportCardRef = useRef(null);'
);

code = code.replace(
  'if (!cardRef.current) return;',
  'if (!exportCardRef.current) return;'
);
code = code.replace(
  'const images = Array.from(cardRef.current.querySelectorAll("img"));',
  'const images = Array.from(exportCardRef.current.querySelectorAll("img"));'
);
code = code.replace(
  'const canvas = await html2canvas(cardRef.current, {',
  'const canvas = await html2canvas(exportCardRef.current, {'
);
code = code.replace(
  '* { box-sizing: border-box !important; }',
  '* { box-sizing: border-box !important; letter-spacing: 0px !important; }'
);

const startStr = '<div\n                  ref={cardRef}\n                  style={{';
const startIdx = code.indexOf(startStr);
const endStr = '              </div>\n            </div>\n          </div>\n        </div>\n\n        {/* Action Buttons';
const endIdx = code.indexOf(endStr);

const oldCardUI = code.substring(startIdx, endIdx);

const replacement = '<CardContent \n' +
'                  date={date} \n' +
'                  summary={summary} \n' +
'                  rows={rows} \n' +
'                  userName={userName} \n' +
'                  userRole={userRole} \n' +
'                  innerRef={cardRef}\n' +
'                />\n' +
'              </div>\n' +
'            </div>\n' +
'          </div>\n' +
'        </div>\n' +
'\n' +
'        {/* Hidden unscaled card specifically for pristine html2canvas export */}\n' +
'        <div style={{ position: "fixed", top: "-9999px", left: "-9999px", pointerEvents: "none" }}>\n' +
'           <CardContent \n' +
'              date={date} \n' +
'              summary={summary} \n' +
'              rows={rows} \n' +
'              userName={userName} \n' +
'              userRole={userRole} \n' +
'              innerRef={exportCardRef}\n' +
'           />\n' +
'        </div>\n';

code = code.replace(oldCardUI, replacement);

let newCardUI = oldCardUI.replace(/letterSpacing: "-0.02em"/g, 'letterSpacing: "normal"');
newCardUI = newCardUI.replace(/letterSpacing: "1px"/g, 'letterSpacing: "normal"');
newCardUI = newCardUI.replace(/letterSpacing: "0.5px"/g, 'letterSpacing: "normal"');
newCardUI = newCardUI.replace('ref={cardRef}', 'ref={innerRef}');

code += '\n\nfunction CardContent({ date, summary, rows, userName, userRole, innerRef }) {\n  return (\n' + newCardUI + '  );\n}\n';

fs.writeFileSync('src/components/dispatch/DispatchShareCard.jsx', code);
console.log('Done!');
