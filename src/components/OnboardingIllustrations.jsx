export default function OnboardingIllustration({ index = 0 }) {
  const common = {
    viewBox: '0 0 360 230',
    className: 'h-full w-full overflow-visible',
    role: 'presentation',
    'aria-hidden': true,
    focusable: 'false',
  };

  if (index === 0) {
    return (
      <svg {...common}>
        <circle cx="180" cy="116" r="96" fill="#e7f2ec" />
        <rect x="42" y="22" width="276" height="188" rx="23" fill="#ffffff" stroke="#dbe8df" strokeWidth="1.5" />
        <circle cx="64" cy="43" r="4" fill="#0b7655" />
        <rect x="76" y="39" width="63" height="7" rx="3.5" fill="#d7e4dc" />
        <rect x="278" y="36" width="22" height="14" rx="7" fill="#eaf5ef" />
        <rect x="62" y="64" width="145" height="60" rx="13" fill="#f2f7f4" />
        <text x="76" y="83" fontSize="9" fill="#728178">Solde disponible</text>
        <text x="76" y="105" fontSize="19" fontWeight="700" fill="#173d2d">248 500</text>
        <text x="76" y="116" fontSize="8" fill="#728178">FCFA</text>
        <rect x="217" y="64" width="84" height="60" rx="13" fill="#0b5c46" />
        <path d="M231 94l9-9 8 6 12-14" fill="none" stroke="#b5ead0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="260" cy="77" r="3" fill="#ffffff" className="onboard-pulse" />
        <text x="231" y="108" fontSize="8" fill="#e4f4eb">Ce mois-ci</text>
        <rect x="62" y="139" width="239" height="53" rx="12" fill="#fbfcfb" stroke="#edf2ee" />
        <path d="M77 176H286" stroke="#e2ebe5" strokeWidth="1" />
        <path d="M77 161H286" stroke="#eef2ef" strokeWidth="1" strokeDasharray="3 4" />
        <rect x="91" y="163" width="17" height="13" rx="4" fill="#aad8bf" />
        <rect x="127" y="151" width="17" height="25" rx="4" fill="#72b990" className="onboard-rise onboard-delay-1" />
        <rect x="163" y="158" width="17" height="18" rx="4" fill="#9bcfb0" className="onboard-rise onboard-delay-2" />
        <rect x="199" y="145" width="17" height="31" rx="4" fill="#0b7655" className="onboard-rise onboard-delay-3" />
        <rect x="235" y="153" width="17" height="23" rx="4" fill="#72b990" className="onboard-rise onboard-delay-1" />
        <rect x="271" y="149" width="9" height="27" rx="4" fill="#c4e3d0" />
        <circle cx="300" cy="29" r="6" fill="#a9d8be" className="onboard-float" />
        <circle cx="30" cy="177" r="5" fill="#b8dcca" className="onboard-float onboard-delay-2" />
      </svg>
    );
  }

  if (index === 1) {
    return (
      <svg {...common}>
        <circle cx="178" cy="116" r="99" fill="#eaf3ee" />
        <rect x="43" y="30" width="274" height="170" rx="24" fill="#ffffff" stroke="#dce9e1" strokeWidth="1.5" />
        <rect x="61" y="49" width="44" height="44" rx="15" fill="#0b5c46" />
        <path d="M72 73c0-8 5-13 11-13s11 5 11 13" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
        <circle cx="79" cy="69" r="2" fill="#ffffff" />
        <circle cx="87" cy="69" r="2" fill="#ffffff" />
        <path d="M78 80q5 4 10 0" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
        <rect x="116" y="55" width="112" height="8" rx="4" fill="#193f30" />
        <rect x="116" y="70" width="80" height="6" rx="3" fill="#d6e4db" />
        <rect x="62" y="108" width="175" height="30" rx="12" fill="#f1f6f3" />
        <circle cx="78" cy="123" r="5" fill="#a9cdb7" />
        <rect x="91" y="119" width="127" height="6" rx="3" fill="#b9cbbf" />
        <rect x="128" y="148" width="170" height="34" rx="13" fill="#0b5c46" className="onboard-float" />
        <rect x="145" y="160" width="122" height="6" rx="3" fill="#ffffff" opacity=".9" />
        <rect x="145" y="170" width="88" height="4" rx="2" fill="#b6dfc8" />
        <path d="M267 42l4 9 9 4-9 4-4 9-4-9-9-4 9-4z" fill="#d5a84d" className="onboard-pulse" />
        <circle cx="294" cy="107" r="7" fill="#a9d8be" className="onboard-float onboard-delay-2" />
        <circle cx="63" cy="176" r="5" fill="#d8e9df" className="onboard-float" />
      </svg>
    );
  }

  if (index === 2) {
    return (
      <svg {...common}>
        <circle cx="180" cy="118" r="100" fill="#e8f2ee" />
        <rect x="119" y="12" width="122" height="206" rx="24" fill="#173b2d" />
        <rect x="125" y="19" width="110" height="192" rx="19" fill="#ffffff" />
        <rect x="157" y="27" width="45" height="5" rx="2.5" fill="#d7e4dc" />
        <circle cx="145" cy="51" r="10" fill="#eaf5ef" />
        <path d="M140 51h10M145 46v10" stroke="#0b7655" strokeWidth="1.8" strokeLinecap="round" />
        <rect x="161" y="45" width="55" height="6" rx="3" fill="#c5d4ca" />
        <rect x="137" y="71" width="86" height="72" rx="12" fill="#f1f7f3" />
        <text x="148" y="88" fontSize="8" fill="#748279">Confirmation</text>
        <text x="148" y="104" fontSize="10" fontWeight="700" fill="#173d2d">+ 25 000 F</text>
        <text x="148" y="117" fontSize="7" fill="#728178">Entrée d’argent</text>
        <circle cx="180" cy="131" r="7" fill="#0b7655" />
        <path d="M176.5 131l2.4 2.4 4.6-5" fill="none" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="137" y="153" width="86" height="9" rx="4.5" fill="#e6eee9" />
        <rect x="137" y="169" width="58" height="6" rx="3" fill="#edf2ee" />
        <rect x="25" y="90" width="112" height="53" rx="14" fill="#ffffff" stroke="#dce9e1" className="onboard-float" />
        <circle cx="42" cy="107" r="7" fill="#0b5c46" />
        <path d="M39 107h6M42 104v6" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
        <text x="55" y="108" fontSize="8" fontWeight="700" fill="#254437">SMS reconnu</text>
        <rect x="39" y="119" width="81" height="5" rx="2.5" fill="#d5e1d9" />
        <rect x="39" y="129" width="59" height="4" rx="2" fill="#e5ede8" />
        <circle cx="276" cy="67" r="16" fill="#d6ecdf" className="onboard-pulse" />
        <path d="M270 67h12M278 62l5 5-5 5" fill="none" stroke="#0b7655" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M263 155q16 14 31 0" fill="none" stroke="#9acdb0" strokeWidth="2" strokeDasharray="4 4" className="onboard-draw" />
      </svg>
    );
  }

  if (index === 3) {
    return (
      <svg {...common}>
        <circle cx="180" cy="116" r="99" fill="#f1f4e9" />
        <path d="M117 79h126v18H117z" fill="#173d2d" />
        <rect x="126" y="88" width="108" height="112" rx="24" fill="#ffffff" stroke="#d7e5db" strokeWidth="2" />
        <rect x="133" y="111" width="94" height="82" rx="18" fill="#e7f3eb" />
        <path d="M133 151q23-12 47 0t47 0v24q0 18-18 18h-58q-18 0-18-18z" fill="#a6d3b7" className="onboard-fill" />
        <rect x="151" y="67" width="58" height="15" rx="6" fill="#b7cbbd" />
        <circle cx="165" cy="49" r="17" fill="#e3ba63" stroke="#c99c43" strokeWidth="2" className="onboard-float" />
        <text x="165" y="54" textAnchor="middle" fontSize="14" fontWeight="700" fill="#ffffff">F</text>
        <circle cx="201" cy="38" r="12" fill="#f3d48f" stroke="#d6b46c" strokeWidth="1.5" className="onboard-float onboard-delay-2" />
        <text x="201" y="42" textAnchor="middle" fontSize="10" fontWeight="700" fill="#ffffff">F</text>
        <rect x="54" y="105" width="67" height="39" rx="12" fill="#ffffff" stroke="#e1e9e3" />
        <text x="67" y="120" fontSize="8" fill="#718077">Objectif</text>
        <text x="67" y="134" fontSize="12" fontWeight="700" fill="#0b5c46">75 %</text>
        <rect x="243" y="139" width="66" height="39" rx="12" fill="#0b5c46" className="onboard-float" />
        <path d="M257 160l7 7 14-16" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="91" cy="65" r="5" fill="#b4d9c2" className="onboard-pulse" />
        <circle cx="273" cy="75" r="5" fill="#d3b46e" className="onboard-pulse onboard-delay-2" />
      </svg>
    );
  }

  if (index === 4) {
    return (
      <svg {...common}>
        <circle cx="180" cy="115" r="100" fill="#edf2f4" />
        <rect x="95" y="78" width="170" height="113" rx="18" fill="#ffffff" stroke="#dce6e1" strokeWidth="1.5" />
        <rect x="111" y="94" width="138" height="9" rx="4.5" fill="#e7eee9" />
        <rect x="111" y="115" width="138" height="23" rx="9" fill="#f4f7f5" />
        <circle cx="125" cy="126" r="6" fill="#b0d9bf" />
        <rect x="140" y="122" width="69" height="6" rx="3" fill="#c9d8ce" />
        <rect x="220" y="121" width="17" height="9" rx="4.5" fill="#d8eee0" />
        <rect x="111" y="147" width="138" height="23" rx="9" fill="#f4f7f5" />
        <circle cx="125" cy="158" r="6" fill="#e3c47d" />
        <rect x="140" y="154" width="52" height="6" rx="3" fill="#c9d8ce" />
        <rect x="220" y="153" width="17" height="9" rx="4.5" fill="#d8eee0" />
        <circle cx="72" cy="74" r="25" fill="#0b5c46" />
        <circle cx="72" cy="66" r="8" fill="#f4d8c1" />
        <path d="M58 87q14-15 28 0v8H58z" fill="#b7d9c4" />
        <circle cx="286" cy="74" r="25" fill="#d8e8df" />
        <circle cx="286" cy="66" r="8" fill="#e8c8ad" />
        <path d="M272 87q14-15 28 0v8h-28z" fill="#0b5c46" />
        <circle cx="179" cy="36" r="24" fill="#e0ba70" />
        <circle cx="179" cy="29" r="8" fill="#f0d7c2" />
        <path d="M165 49q14-15 28 0v9h-28z" fill="#ffffff" />
        <path d="M96 74q-9 15-5 27M263 74q9 15 5 27" fill="none" stroke="#8fc7a6" strokeWidth="2" strokeLinecap="round" className="onboard-draw" />
        <circle cx="94" cy="45" r="5" fill="#a6d5b7" className="onboard-pulse" />
        <circle cx="265" cy="42" r="5" fill="#e3c47d" className="onboard-pulse onboard-delay-2" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <circle cx="180" cy="116" r="100" fill="#e9f2ed" />
      <rect x="50" y="29" width="260" height="173" rx="20" fill="#ffffff" stroke="#dce9e1" strokeWidth="1.5" />
      <text x="72" y="54" fontSize="9" fill="#738178">Bilan de tes finances</text>
      <rect x="72" y="65" width="85" height="8" rx="4" fill="#173d2d" />
      <rect x="72" y="82" width="216" height="95" rx="13" fill="#f7faf8" />
      <path d="M86 157H273M86 134H273M86 111H273" stroke="#e3ebe6" strokeWidth="1" strokeDasharray="3 4" />
      <path d="M92 148L128 133L163 141L202 108L236 119L270 91" fill="none" stroke="#0b7655" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="onboard-draw" />
      <circle cx="128" cy="133" r="4" fill="#ffffff" stroke="#0b7655" strokeWidth="2" />
      <circle cx="202" cy="108" r="4" fill="#ffffff" stroke="#0b7655" strokeWidth="2" />
      <circle cx="270" cy="91" r="5" fill="#0b7655" className="onboard-pulse" />
      <rect x="72" y="183" width="61" height="5" rx="2.5" fill="#d8e5dc" />
      <rect x="143" y="183" width="41" height="5" rx="2.5" fill="#e5ede8" />
      <circle cx="302" cy="36" r="7" fill="#e2c17a" className="onboard-float" />
      <circle cx="40" cy="170" r="6" fill="#a8d5b8" className="onboard-float onboard-delay-2" />
    </svg>
  );
}