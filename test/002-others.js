import {parse, decode} from '../source/pdu.js';

import pdu from 'pdu';

import nodePdu from 'node-pdu';

import tpdu from 'tpdu';

import assert from 'assert';

var pduStrings = [
	'07919730071111F14007D0CD21720A0008718042814134218B0608040AE50301041D04300020043E0441043D043E04320430043D043804380020043F0440043E0433043D043E0437043000200424041304110423002000AB04260435043D044204400430043B044C043D043E0435002004230413041C042100BB00200032003400200430043204330443044104420430002004320020041C043E0441043A043204350020',
	/* standard sms submit */ '0011000B916407281553F80000AA0AE8329BFD4697D9EC37',
	'07919730071111F1400DD0C272999D7697010008812082210383218B0608044AC00402043F043E04410442043E043F043B04300442043D043E0439002004410438044104420435043C04350020044004300441044704350442043E0432002E002004230437043D04300439044204350020043E0431043E002004320441043504450020043504510020043F044004350438043C0443044904350441044204320430044500200438',
	'07919730071111F1400DD0C272999D7697010008812082210393218B0608044AC004010414043E04310440043E0020043F043E04360430043B043E043204300442044C00200432002004110438043B04300439043D00210020042304320430043604300435043C044B04390020041A043B04380435043D0442002C00200412044B0020043E04310441043B044304360438043204300435044204350441044C0020043D04300020',
	'07919730071111F1400DD0C272999D7697010008812082210304218B0608044AC004030020041204300448043804450020043D043E0432044B044500200432043E0437043C043E0436043D043E04410442044F04450020043F043E0020043D043E043C043504400443002000300036003100360020002804370432043E043D043E043A0020043104350441043F043B04300442043D044B04390029002E0020041F04400438044F',
	'07919730071111F1440DD0C272999D769701000881208221031421390608044AC004040442043D043E0433043E0020043E043104490435043D0438044F00210020041204300448002004110438043B04300439043D',
	/* standard sms */ '07911326040000F0040B911346610089F60000208062917314080CC8F71D14969741F977FD07',
	/* standard sms deliver */ '07917283010010F5040BC87238880900F10000993092516195800AE8329BFD4697D9EC37',
	/* standard sms 2 */ '0001000B915121551532F400000CC8F79D9C07E54F61363B04',
	/* flash sms */ '0001010B915121551532F40010104190991D9EA341EDF27C1E3E9743',
	/* voicemail indication */ '0001AB0B915121551532F400C80F3190BB7C07D9DFE971B91D4EB301',
	/* Perl Device::GSM (t/06) */
	/* deliver */ '07919471016730510410D06B7658DE7E8BD36C39006070228105118094C8309BFD6681C262D0FC6D7ECBE92071DA0D4A8FD1A0BA9B5E9683DCE57A590E92D6CDEE7ABB5D968356B45CAC16ABD972319A8C360395E5F2727A8C1687E52E90355D66974147B9DF530651DFF239BDEC0635FD6C7659EE5296E97A3A68CD0ECBC7613919242ECFE96536BBEC06D5DDF4B21C74BFDF5D6B7658DE7E8BD36C17B90C',
	/*  */ '059172281991040B917228732143F90000202140311040806846F9BB0D2296EF613619444597E56F3708357DD7E96850D02C4F8FC3A99D8258B6A7C7E5D671DE06D963AE988DA548BBE7F4309B5D2683DE6E1008D59C5ED3EE992CC502C1CB7236C85E73C16036182CA668BEC9BA69B2D82C3AA7',
	/* submit */ '0011FF048160110000AD1CD4F29C0E6A97E7F3F0B90C32BFE52062D99E1E9775BAE3BC0D',
];

describe.only ('pdu modules', function () {

	it ("jsPduDecoder should parse some pdu", function () {

		pduStrings.forEach ((pduString, idx) => {
			var structure = parse (pduString);

			if (idx === 0) {
				assert.equal (structure.smsCentre.number, '79037011111', 'SMS Center invalid');
				assert.equal (structure.typeOfMessage.type, 'deliver', 'Deliver type expected');

				assert.deepEqual (
					structure.typeOfMessage.flags,
					{'TP-UDHI':true, 'TP-MMS': true},
					'User data header flag expected'
				);

				assert.equal (structure.serviceCentreTimestamp.date.toISOString(), '2017-08-24T15:14:43.000Z');

				assert.equal (structure.address.number, 'MCHS', 'Address should be MCHS');
				assert.equal (structure.messageHandling.alphabet, 'ucs2', 'Data coding scheme should be UCS2');
				assert.deepEqual (structure.userDataHeader.parts, {
					part: 1,
					total: 3,
					ref: 2789
				});
				assert.equal (structure.userData, 'На основании прогноза ФГБУ «Центральное УГМС» 24 августа в Москве ');
				console.log (JSON.stringify (structure, null, '\t'));
			}

		})
	});

	it.skip ("pdu should parse some pdu", function () {

		pduStrings.forEach ((pduString, idx) => {
			var structure = pdu.parse (pduString);

			if (idx === 0) {
				assert.equal (structure.smsc, '79037011111', 'SMS Center invalid');

				// flags missing completely

				assert (structure.time.toISOString().indexOf ('2017-08-24T15:14:43') === 0);

				assert.equal (structure.encoding, '16bit', 'Data coding scheme should be 16bit (UCS2)');

				assert.deepEqual (structure.udh, {
					current_part: 1,
					iei: "08",
					length: "06",
					parts: 3,
					reference_number: "0" + 2789..toString(16).toUpperCase() //"0AE5"
				});

				assert.equal (structure.sender, 'MCHS', 'Address should be MCHS');
				assert.equal (structure.text, 'На основании прогноза ФГБУ «Центральное УГМС» 24 августа в Москве ');

				console.log (JSON.stringify (structure, null, '\t'));
			}

		})
	});

	it.skip ("node-pdu should parse some pdu", function () {

		pduStrings.forEach ((pduString, idx) => {

			// not working at all

			var structure = nodePdu.parse (pduString);

			if (idx === 0) {
				assert.equal (structure.smsc, '79037011111', 'SMS Center invalid');

				assert (structure.time.toISOString().indexOf ('2017-08-24T15:14:43') === 0);

				assert.equal (structure.encoding, '16bit', 'Data coding scheme should be 16bit (UCS2)');

				assert.deepEqual (structure.udh, {
					current_part: 1,
					iei: "08",
					length: "06",
					parts: 3,
					reference_number: "0" + 2789..toString(16).toUpperCase() //"0AE5"
				});

				assert.equal (structure.sender, 'MCHS', 'Address should be MCHS');
				assert.equal (structure.text, 'На основании прогноза ФГБУ «Центральное УГМС» 24 августа в Москве ');

				console.log (JSON.stringify (structure, null, '\t'));
			}

		})
	});

	it.skip ("tpdu should parse some pdu", function () {

		pduStrings.forEach ((pduString, idx) => {

			var parser = new tpdu.Parser();
			var structure = parser.parse (pduString, 'inbound');

			if (idx === 0) {

				console.log (JSON.stringify (structure, null, '\t'));

				assert.equal (structure.sca.address, '79037011111', 'SMS Center invalid');

				// flags missing completely

				// no time zone
				assert (structure.tpscts.toISOString ().indexOf ('2017-08-24T15:14:43') === 0);

				// no parts information

				assert.equal (structure.tpoa.address, 'MCHS', 'Address should be MCHS');
				assert.equal (structure.tpud, 'На основании прогноза ФГБУ «Центральное УГМС» 24 августа в Москве ');
			}

		})
	});

})

