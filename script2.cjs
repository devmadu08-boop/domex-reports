const fs = require('fs');

let code = fs.readFileSync('src/components/dispatch/DispatchShareCard.jsx', 'utf8');

const startStr = '<div\n                  ref={cardRef}\n                  style={{';
const endStr = '              </div>\n            </div>\n          </div>\n        </div>\n\n        {/* Action Buttons';

const startIdx = code.indexOf(startStr);
const endIdx = code.indexOf(endStr);

const oldCardUI = code.substring(startIdx, endIdx);

let cardContentStr = 'export default function CardContent({ date, summary, rows, userName, userRole, innerRef }) {\n  return (\n' + oldCardUI + '  );\n}\n';
cardContentStr = cardContentStr.replace('ref={cardRef}', 'ref={innerRef}');
cardContentStr = cardContentStr.replace(/letterSpacing: "-0.02em"/g, 'letterSpacing: "normal"');
cardContentStr = cardContentStr.replace(/letterSpacing: "1px"/g, 'letterSpacing: "normal"');
cardContentStr = cardContentStr.replace(/letterSpacing: "0.5px"/g, 'letterSpacing: "normal"');

fs.writeFileSync('src/components/dispatch/CardContent.jsx', cardContentStr);

const replacement = <CardContent 
                  date={date} 
                  summary={summary} 
                  rows={rows} 
                  userName={userName} 
                  userRole={userRole} 
                  innerRef={cardRef}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Hidden unscaled card specifically for pristine html2canvas export */}
        <div style={{ position: "fixed", top: "-9999px", left: "-9999px", pointerEvents: "none" }}>
           <CardContent 
              date={date} 
              summary={summary} 
              rows={rows} 
              userName={userName} 
              userRole={userRole} 
              innerRef={exportCardRef}
           />
        </div>
;

code = code.replace(oldCardUI, replacement);
code = 'import CardContent from "./CardContent.jsx";\n' + code;

fs.writeFileSync('src/components/dispatch/DispatchShareCard.jsx', code);
console.log('Done!');
