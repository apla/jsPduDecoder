import {encodeAddress, try7Bit, encode7Bit, stringify, parse} from '../source/pdu.js';

import assert from 'assert';

describe.only ('pdu encoder', function () {
	it ('should encode phone number', function () {
		assert.equal (encodeAddress('3289287791'),    '0A812398827719'   );
		assert.equal (encodeAddress('+393289287791'), '0C91932398827719' );
		assert.equal (encodeAddress('347101010'),     '098143171010F0'   );
		assert.equal (encodeAddress('+39347101010'),  '0B919343171010F0' );
		// assert.equal (encodeAddress('klarmobil'),     '10D06B7658DE7E8BD36C' );
		// assert.equal (encodeAddress('HELLO'),         '0B919343171010F0' );
	});

	it ('should encode 7bit', function () {
		var textAT = 'Unter <>.at könnt ihr ganz einfach für eure <> Rufnummer jeden beliebigen Betrag zwischen 10 und 100€ aufladen';
		var textFR = 'à partir de 25,99€/mois pendant 12 mois puis 44,99€/mois 200 Mbits/s en débit descendant 100 Mbits/s en débit montant';
		var textRU = 'Двойной пакет интернета, SMS, безлимитные звонки в сети «», пакет минут дома и в поездках по России';

		var arrayAT = try7Bit(textAT);
		var arrayFR = try7Bit(textFR);
		var arrayRU = try7Bit(textRU);

		assert (arrayAT.length);
		assert (arrayFR.length);
		assert (arrayRU === undefined);

		assert.equal (
			encode7Bit (try7Bit ('*110*10#')),
			'AA580CA68AC146',
			'USSD address should be encoded'
		);

		assert.equal (
			encode7Bit (try7Bit ('hellohello')),
			'0AE8329BFD4697D9EC37'.slice(2)
		);
		assert.equal (
			encode7Bit (try7Bit ('The quick fox jumps over the lazy dog')),
			'2554741914AFA7C76B90F98D07A9EB6DF81CF4B697E5203ABA0C6287F57910F97D06'.slice(2)
		);
		assert.equal (
			encode7Bit (try7Bit ('[Landstraße]')),
			'XX1B1E33EC26CFE9F2B0A7BCF101'.slice(2)
		);
	});

	it ('should encode 7bit message', function () {
		var source = {
			address: "+79031111111",
			userData: "The quick fox jumps over the lazy dog"
		};
		var pduString = stringify (source);
		// console.log (pduString);
		var structure = parse (pduString[0]);
		// console.log (structure);

		assert.equal (structure.typeOfMessage.type, 'submit');
		assert.equal (structure.userData, source.userData);
		assert.equal (structure.messageHandling.alphabet, 'default'); // 7bit by default

	});

	it ('should encode ucs2 message', function () {
		var source = {
			address: "+79031111111",
			userData: "Привет"
		};

		var pduString = stringify (source);
		// console.log (pduString);
		var structure = parse (pduString[0]);
		// console.log (structure);

		assert.equal (structure.typeOfMessage.type, 'submit');
		assert.equal (structure.userData, source.userData);
		assert.equal (structure.messageHandling.alphabet, 'ucs2');

	});

	it ('should encode ucs2 messages for a long sms text', function () {

		var texts = [
			'Полипропиленовые конденсаторы радиальные, резисторы, конденсаторы,',
			' радиаторы, предохранители, пассивные компоненты.  Заказ и оплата ',
			'онлайн, доставка.'
		];

		var source = {
			address: "+79031111111",
			userData: texts.join ('')
		};

		var pduString = stringify (source);
		// console.log (pduString);

		assert.equal (pduString.length, 3);

		var structure = parse (pduString[0]);
		// console.log (structure);
		assert.equal (structure.userData, texts[0]);
		assert.equal (structure.typeOfMessage.type, 'submit');
		assert.equal (structure.messageHandling.alphabet, 'ucs2');
		assert.equal (structure.userDataHeader.parts.part, 1);
		assert.equal (structure.userDataHeader.parts.total, 3);

		structure = parse (pduString[1]);
		// console.log (structure);
		assert.equal (structure.userData, texts[1]);
		assert.equal (structure.userDataHeader.parts.part, 2);
		assert.equal (structure.userDataHeader.parts.total, 3);


		structure = parse (pduString[2]);
		// console.log (structure);
		assert.equal (structure.userData, texts[2]);
		assert.equal (structure.userDataHeader.parts.part, 3);
		assert.equal (structure.userDataHeader.parts.total, 3);

	});

});
