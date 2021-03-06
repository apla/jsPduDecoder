/**
 * Actual implementation of a PDU decoder. Decodes all information defined in
 * {@linkplain http://www.dreamfabric.com/sms/} and {@linkplain http://mobiletidings.com/}
 *
 * @param {string} pdu Contains the PDU decoded SMS
 * @return {Array|string} Decoded information from PDU as one dimensional array, description and information split through '\t'
 * or error string if not a valid PDU
 */
function decodePdu( pdu ) {
    var i,
        result = [];

    var octets = splitter( pdu );

    if (!octets) {
        return "Invalid PDU String!";
    }

    var tokens = tokenizer( octets );

    for (i = 0; i < tokens.length; ++i) {
        result.push( tokens[ i ]() );
    }

    return result;
}

/**
 * Splits a PDU string into an array of 2 byte octets
 *
 * @param {string} pdu
 * @return {?Array} Octets or null if PDU contains invalid characters or has invalid length
 */
function splitter( pdu ) {
    var i,
        octets = [];

    for (i = 0; i < pdu.length; i += 2) {
        var octet = pdu.substr( i, 2 );

        if (!octet.match( /^[0-9A-F]{2}$/i )) {
            return null;
        }

        octets.push( octet );
    }

    return octets;
}

/**
 * Analyses the PDU octets and returns a list of functions representing one line of
 * information, each.
 *
 * @param {Array<string>} octets
 * @return {Array} List of tokens represented by resolving functions
 */
function tokenizer( octets ) {
    var tokenList = [];
    var pos;
    var numberLength;
    var sliceNumber;
    var sliceNumberToA;
    var TP_PID;
    var TP_DCS;

    // smsc part
    var smscLength = parseInt( octets[0], 16 );

    if (smscLength) {
        var sliceSmsc = octets.slice( 2, smscLength + 1 );
        var sliceSmscToA = octets[1];
        tokenList.push( function(){ return '(hideable)SMSC number\t' + tokens.Number( sliceSmsc, undefined, tokens.ToA( sliceSmscToA ) ); } );
        tokenList.push( function(){ return '(hideable)SMSC number info\t' + tokens.ToA( sliceSmscToA ).info; } );
    }

    // Sender/Receiver part
    pos = smscLength + 1;
    var pduType = tokens.ToM( octets[ pos ] );
    tokenList.push( function(){ return '(hideable)PDU Type\t' + pduType.info; } );

    if (pduType.type === 'deliver') {
        pos++;
        numberLength = parseInt( octets[ pos ], 16 );

        pos++;
        if (numberLength) {
            sliceNumber = octets.slice( pos + 1, pos + 1 + Math.ceil( numberLength / 2 ) );
            sliceNumberToA = octets[ pos ];
            tokenList.push( function(){ return '(hideable)Number\t' + tokens.Number( sliceNumber, numberLength, tokens.ToA( sliceNumberToA ) ); } );
            tokenList.push( function(){ return '(hideable)Number info\t' + tokens.ToA( sliceNumberToA ).info; } );

            pos += 1 + Math.ceil( numberLength / 2 );
        }

        TP_PID = octets[ pos ];
        tokenList.push( function(){ return '(hideable)Protocol Identifier\t' + tokens.PID( TP_PID ); } );

        pos++;
        TP_DCS = tokens.DCS( octets[ pos ] );
        tokenList.push( function(){ return '(hideable)Data Coding Scheme\t' + TP_DCS.info; } );

        pos++;
        var sliceTimeStamp = octets.slice( pos, pos + 7 );
        tokenList.push( function(){ return '(hideable)Service Centre Time Stamp\t' + tokens.SCTS( sliceTimeStamp ); } );

        pos += 6;
    }
    else if (pduType.type === 'submit') {
        pos++;
        var MR = octets[ pos ];
        tokenList.push( function() { return '(hideable)TP Message Reference\t' + tokens.MR( MR ); } );

        pos++;
        numberLength = parseInt( octets[ pos ], 16 );

        pos++;

        if (numberLength) {
            sliceNumber = octets.slice( pos + 1, pos + 1 + Math.ceil( numberLength / 2 ) );
            sliceNumberToA = octets[ pos ];
            tokenList.push( function(){ return '(hideable)Number\t' + tokens.Number( sliceNumber, numberLength, tokens.ToA( sliceNumberToA ) ); } );
            tokenList.push( function(){ return '(hideable)Number info\t' + tokens.ToA( sliceNumberToA ).info; } );

            pos += 1 + Math.ceil( numberLength / 2 );
        }

        TP_PID = octets[ pos ];
        tokenList.push( function(){ return '(hideable)Protocol Identifier\t' + tokens.PID( TP_PID ); } );

        pos++;
        TP_DCS = tokens.DCS( octets[ pos ] );
        tokenList.push( function(){ return '(hideable)Data Coding Scheme\t' + TP_DCS.info; } );

        if (pduType.flags['TP-VPF']) {
            pos++;
            var sliceVP;
            if (pduType.flags['TP-VPF'] === 'relative') {
                sliceVP = octets[ pos ];
                tokenList.push( function(){ return '(hideable)Validity Period\t' + tokens.VPrelative( sliceVP ); } );
            }
            else if (pduType.flags['TP-VPF'].match( /^(absolute|relative)$/ )) {
                sliceVP = octets.slice( pos, pos + 7 );
                tokenList.push( function(){ return '(hideable)Validity Period\tuntil ' + tokens.SCTS( sliceVP ); } );
                pos += 6;
            }
        }
    }

    pos ++;
    var TP_UDL = tokens.UDL( octets[ pos ], TP_DCS.alphabet );
    tokenList.push( function(){ return 'User Data Length\t' + TP_UDL.info; } );

    var TP_UDHL = {};
    var TP_UDH = {};
    if (pduType.flags['TP-UDHI']) {
        pos++;
        TP_UDHL = tokens.UDHL( octets[ pos ], TP_DCS.alphabet );
        tokenList.push( function() { return 'User Data Header Length\t' + TP_UDHL.info; } );

        pos++;
        TP_UDH = tokens.UDH( octets.slice( pos, pos + TP_UDHL.length ) );
        tokenList.push( function() { return 'User Data Header\t' + TP_UDH.info; } );
        pos += TP_UDHL.length - 1;
    }

    pos++;
    var expectedMsgEnd = pos + TP_UDL.octets - (TP_UDHL.length ? TP_UDHL.length + 1 : 0);
    var sliceMessage = octets.slice( pos, expectedMsgEnd );

    if (TP_UDH.wap) {
        var wapMessage = wapDecoder( sliceMessage );
        tokenList.push( function(){ return 'User Data\tWireless Session Protocol (WSP) / WBXML ' + wapMessage; } );
    }
    else {
        tokenList.push( function(){ return 'User Data\t' + tokens.UD( sliceMessage, TP_DCS.alphabet, TP_UDHL.padding, TP_UDH.formatting ); } );

        if (expectedMsgEnd < octets.length) {
            tokenList.push( function(){ return 'VIOLATION\tPDU longer than expected!'; } );

            var sliceMessageAll = octets.slice( pos, octets.length );
            tokenList.push( function(){ return 'User Data /w additional stuff\t' + tokens.UD( sliceMessageAll, TP_DCS.alphabet, TP_UDHL.padding, TP_UDH.formatting ); } );

        }
        else if (expectedMsgEnd > octets.length) {
            tokenList.push( function(){ return 'VIOLATION\tPDU shorter than expected!'; } );
        }
    }

    return tokenList;
}

/**
 * Actual implementation of a PDU decoder. Decodes all information defined in
 * {@linkplain http://www.dreamfabric.com/sms/} and {@linkplain http://mobiletidings.com/}
 *
 * @param {string} pdu Contains the PDU decoded SMS
 * @return {Object} Decoded information from PDU
 * @throws {Error} Invalid PDU string
 */
function parsePdu( pdu, verbose ) {
    var i;

    var octets = splitter( pdu );

    if (!octets) {
        return "Invalid PDU String!";
    }

    var result = parseOctets( octets );

    return result;
}

/**
 * converts timestamp to date object
 */
function timestampToDate (ts) {
    var chunks = ts.split (' ');
    var stringTz, tz = parseInt (chunks[3], 10);
    if (tz > -10 && tz < 0) {
        stringTz = '-0' + Math.abs (tz)
    } else if (tz > 0 && tz < 10) {
        stringTz = '+0' + tz
    } else if (tz > 9) {
        stringTz = '+' + tz
    } else {
        stringTz = tz.toString();
    }
    return {
        tz: stringTz,
        date: new Date (Date.parse (chunks[0] + 'T' + chunks[1] + 'Z') - tz*60*60*1000)
    };
}

/**
 * Analyses the PDU octets and returns a PDU internal structures.
 *
 * @param {Array<string>} octets
 * @return {Object} PDU structure
 */
function parseOctets( octets, verbose ) {
    var result = {};
    var pos;
    var numberLength;
    var sliceNumber;
    var sliceNumberToA;
    var numberToA;
    var TP_PID;
    var TP_DCS;

    // SMS Center part
    var smscLength = parseInt( octets[0], 16 );

    if (smscLength) {
        var sliceSmsc = octets.slice( 2, smscLength + 1 );
        var sliceSmscToA = octets[1];
        var smscToA = tokens.ToA( sliceSmscToA );
        // SMSC
        result.smsCentre = {
            number: tokens.Number( sliceSmsc, undefined, smscToA )
        };
        if (verbose)
            result.smsCentre.ToA = smscToA;
        Object.defineProperty (result, 'smsCenter', {writable: true, value: result.smsCentre});
    }

    // Sender/Receiver part
    pos = smscLength + 1;
    var pduType = tokens.ToM( octets[ pos ] );

    result.typeOfMessage  = {};
    for (var k in pduType) {
        if (k === 'info' && !verbose)
            continue;
        result.typeOfMessage[k] = pduType[k];
    }

    if (pduType.type === 'deliver') {
        pos++;
        numberLength = parseInt( octets[ pos ], 16 );

        pos++;
    } else if (pduType.type === 'submit') {
        pos++;
        var MR = octets[ pos ];
        result.messageReference = tokens.MR( MR );

        pos++;
        numberLength = parseInt( octets[ pos ], 16 );

        pos++;
    }

    if (numberLength) {
        sliceNumber = octets.slice( pos + 1, pos + 1 + Math.ceil( numberLength / 2 ) );
        sliceNumberToA = octets[ pos ];
        numberToA = tokens.ToA( sliceNumberToA );
        // TP-DA
        result.address = {
            number: tokens.Number( sliceNumber, numberLength, numberToA ),
        };
        if (verbose)
            result.address.ToA = numberToA;

        pos += 1 + Math.ceil( numberLength / 2 );
    }

    TP_PID = octets[ pos ];
    result.protocolIdentifier = tokens.PID( TP_PID );

    pos++;
    TP_DCS = tokens.DCS( octets[ pos ] );
    result.messageHandling = {};
    for (var k in TP_DCS) {
        if (!verbose && k === 'info')
            continue;
        result.messageHandling[k] = TP_DCS[k];
    }

    if (pduType.type === 'deliver') {
        pos++;
        var sliceTimeStamp = octets.slice( pos, pos + 7 );
        result.serviceCentreTimestamp = timestampToDate (tokens.SCTS( sliceTimeStamp ));
        Object.defineProperty (result, 'serviceCenterTimestamp', {writable: true, value: result.serviceCentreTimestamp});

        pos += 6;
    } else if (pduType.type === 'submit') {
        if (pduType.flags['TP-VPF']) {
            pos++;
            var sliceVP;
            if (pduType.flags['TP-VPF'] === 'relative') {
                sliceVP = octets[ pos ];
                result.validityPeriod = tokens.VPrelative( sliceVP );
            }
            else if (pduType.flags['TP-VPF'].match( /^(absolute|relative)$/ )) {
                sliceVP = octets.slice( pos, pos + 7 );
                result.validityPeriod = timestampToDate (tokens.SCTS( sliceVP ));
                pos += 6;
            }
        }
    }

    pos ++;
    var TP_UDL = tokens.UDL( octets[ pos ], TP_DCS.alphabet );
    // result.UDL = TP_UDL;

    var TP_UDHL = {};
    var TP_UDH = {};
    if (pduType.flags['TP-UDHI']) {
        pos++;
        TP_UDHL = tokens.UDHL( octets[ pos ], TP_DCS.alphabet );

        pos++;
        TP_UDH = tokens.UDH( octets.slice( pos, pos + TP_UDHL.length ) );
        pos += TP_UDHL.length - 1;
    }

    // result.UDHL = TP_UDHL;
    result.userDataHeader  = {};
    for (var k in TP_UDH) {
        if (k === 'IEs' && !verbose)
            continue;
        if (k === 'info' && !verbose)
            continue;
        result.userDataHeader[k] = TP_UDH[k];
    }

    pos++;
    var expectedMsgEnd = pos + TP_UDL.octets - (TP_UDHL.length ? TP_UDHL.length + 1 : 0);
    var sliceMessage = octets.slice( pos, expectedMsgEnd );

    if (TP_UDH.wap) {
        // TODO
        // var wapMessage = wapDecoder( sliceMessage );
        // tokenList.push( function(){ return 'User Data\tWireless Session Protocol (WSP) / WBXML ' + wapMessage; } );
    }
    else {
        result.userData = tokens.UD( sliceMessage, TP_DCS.alphabet, TP_UDHL.padding, TP_UDH.formatting );

        if (expectedMsgEnd < octets.length) {
            // tokenList.push( function(){ return 'VIOLATION\tPDU longer than expected!'; } );
            console.error ('PDU longer than expected!');

            var sliceMessageAll = octets.slice( pos, octets.length );
            result.userData = tokens.UD( sliceMessageAll, TP_DCS.alphabet, TP_UDHL.padding, TP_UDH.formatting );

        }
        else if (expectedMsgEnd > octets.length) {
            console.error ('PDU shorter than expected!');
            // tokenList.push( function(){ return 'VIOLATION\tPDU shorter than expected!'; } );
        }
    }

    return result;
}

var tokens = {

    /**
     * Number token
     *
     * {@linkplain http://www.dreamfabric.com/sms/}
     *
     * @param {Array<string>} octets containing a call number in BCD inverted nibble format or GSM 7-bit encoding
     * @param {?number=} length expected length of number
     * @param {Object=} addressType the result of the ToA token
     * @return {string} Call number of sender, receiver, SMSC etc.
     */
    Number: function( octets, length, addressType ) {
        var i,
            number = '';

        if (addressType && addressType.ToN === 0x50) {
            number = decode7Bit( octets );
        } else {
            for (i = 0; i < octets.length; ++i) {
                number += reverse( octets[ i ] );
            }

            if (number.match( /\D$/ ) || (length && number.length > length)) {
                var paddingEx = /(.)$/;
                var result = paddingEx.exec( number );

                number = number.substring( 0, number.length - 1 );

                if (result && result[1] && result[1] !== 'F') {
                    number += ' (VIOLATION: number not padded with "F" but with "' + result[1] + '"!)';
                }
            }
        }

        return number;
    },

    /**
     * Type-of-Address token
     *
     * {@linkplain http://www.dreamfabric.com/sms/type_of_address.html}
     *
     * @param {string} octet ToA octet
     * @return {Object} containing ToN (Type of Number) and NPI (Numbering Plan Identification) indicators
     * and description text
     */
    ToA: function( octet ) {
        var type = parseInt( octet, 16 );

        var ToN = type & 0x70; // Type of number Bits
        var NPI = type & 0xF;	// Numbering Plan Identification

        var text = '';

        if (ToN === 0) {
            text += 'Unknown type of address';
        }
        else if (ToN === 0x10) {
            text += 'International number';
        }
        else if (ToN === 0x20) {
            text += 'National number';
        }
        else if (ToN === 0x30) {
            text += 'Network specific number';
        }
        else if (ToN === 0x40) {
            text += 'Subscriber number';
        }
        else if (ToN === 0x50) {
            text += 'Alphanumeric, (coded according to GSM TS 03.38 7-bit default alphabet)';
        }
        else if (ToN === 0x60) {
            text += 'Abbreviated number';
        }
        else if (ToN === 0x70) {
            text += 'Reserved for extension';
        }
        else {
            text += 'Reserved type of address';
        }

        text += ', ';

        if (NPI === 0) {
            text += 'Unknown numbering plan';
        }
        else if (NPI === 1) {
            text += 'ISDN/telephone numbering plan (E.164/E.163)';
        }
        else if (NPI === 3) {
            text += 'IData numbering plan (X.121)';
        }
        else if (NPI === 4) {
            text += 'Telex numbering plan';
        }
        else if (NPI === 8) {
            text += 'National numbering plan';
        }
        else if (NPI === 9) {
            text += 'Private numbering plan';
        }
        else if (NPI === 0xA) {
            text += 'ERMES numbering plan (ETSI DE/PS 3 01-3)';
        }
        else if (NPI === 0xF) {
            text += 'Reserved for extension';
        }
        else {
            text += 'Reserved numbering plan';
        }

        if ((type & 0x80) === 0) {
            text += ' (VIOLATION: Highest bit should always be set!)';
        }

        return {
            ToN: ToN,
            NPI: NPI,
            info: text
        };
    },

    /**
     * Type-of-Message Token
     *
     * (This function only recognizes SMS-DELIVER and SMS-SUBMIT, there are others!)
     *
     * {@linkplain http://www.dreamfabric.com/sms/deliver_fo.html}
     * {@linkplain http://www.dreamfabric.com/sms/submit_fo.html}
     *
     * @param {string} octet ToM octet
     * @return {Object} containing type string 'submit' or 'deliver', UDHI flag, VPF flag, PDU type
     * description text
     * @see UDHI token, VPF token
     */
    ToM: function( octet ) {
        var o = parseInt( octet, 16 );
        var TP_MTI_mask = 0x1; //0x3;
        var text = '';
        var flags = {};
        var deliver = false;
        var submit =false;
        var TP_VPF = null;

        var descriptions = {
            'TP-RP':   'Reply path exists',
            'TP-UDHI': 'User data header indicator',
            'TP-SRR':  'Status report request',
            'TP-VPF':  'Validity Period Format',
            'TP-RD':   'Reject duplicates',
            'TP-SRI':  'Status report indication',
            'TP-MMS':  'More messages to send'
        };

        if ((o & TP_MTI_mask) === 0) {
            text += 'SMS-DELIVER';
            deliver = true;
        }
        else if ((o & TP_MTI_mask) === 1) {
            text += 'SMS-SUBMIT';
            submit = true;
        }
        else {
            console.debug( o, padwZeros( o.toString( 2 ) ) );
        }

        // noinspection JSBitwiseOperatorUsage
        if (o & 0x80) {
            flags['TP-RP'] = true;

        }
        // noinspection JSBitwiseOperatorUsage
        if (o & 0x40) {
            flags['TP-UDHI'] = true;
        }

        if (submit) {
            // noinspection JSBitwiseOperatorUsage
            if (o & 0x20) {
                flags['TP-SRR'] = true;
            }


            var TP_VPF_mask = o & 0x18;
            var vpfText = 'TP-VPF (Validity Period Format): ';

            if (TP_VPF_mask === 0) {
                // do nothing
            }
            else if (TP_VPF_mask === 8) {
                TP_VPF = 'enhanced';
                flags['TP-VPF'] = 'enhanced';
            }
            else if (TP_VPF_mask === 0x10) {
                TP_VPF = 'relative';
                flags['TP-VPF'] = 'relative';
            }
            else if (TP_VPF_mask === 0x18) {
                TP_VPF = 'absolute';
                flags['TP-VPF'] = 'absolute';
            }


            if ((o & 0x4) === 0) {
                flags['TP-RD'] = true;
            }
        }
        else if (deliver) {
            // noinspection JSBitwiseOperatorUsage
            if (o & 0x20) {
                flags['TP-SRI'] = true;
            }

            if ((o & 0x4) === 0) {
                flags['TP-MMS'] = true;
            }
        }

        if (Object.keys(flags).length) {
            text += ', Flags: ' + Object.keys (flags).map(function (flag) {
                return flag + ' (' + descriptions[flag] + ')' + (flags[flag] !== true ? ': ' + flags[flag] : '')
            }).join( ', ' );
        }


        return {
            type: deliver ? 'deliver' : (submit ? 'submit' : ''),
            // TP_VPF: TP_VPF,
            flags: flags,
            info: text
        };
    },

    /**
     * Protocol IDentifier token
     *
     * {@linkplain http://www.dreamfabric.com/sms/pid.html}
     *
     * @param {string} octet PID octet
     * @return {string} PID description text
     */
    PID: function( octet ) {
        var o = parseInt( octet, 16 );
        var text = '';
        var type = o & 0xC0;

        if (type === 0) {
            var firstFive = o & 0x1F;

            // noinspection JSBitwiseOperatorUsage
            if (o & 0x20) {
                text += 'Telematic interworking (Type: ';

                if (firstFive === 0) {
                    text += 'implicit';
                }
                else if (firstFive === 1) {
                    text += 'telex';
                }
                else if (firstFive === 2) {
                    text += 'group 3 telefax';
                }
                else if (firstFive === 3) {
                    text += 'group 4 telefax';
                }
                else if (firstFive === 4) {
                    text += 'voice telephone - speech conversion';
                }
                else if (firstFive === 5) {
                    text += 'ERMES - European Radio Messaging System';
                }
                else if (firstFive === 6) {
                    text += 'National Paging System';
                }
                else if (firstFive === 7) {
                    text += 'Videotex - T.100/T.101';
                }
                else if (firstFive === 8) {
                    text += 'teletex, carrier unspecified';
                }
                else if (firstFive === 9) {
                    text += 'teletex, in PSPDN';
                }
                else if (firstFive === 0xA) {
                    text += 'teletex, in CSPDN';
                }
                else if (firstFive === 0xB) {
                    text += 'teletex, in analog PSTN';
                }
                else if (firstFive === 0xC) {
                    text += 'teletex, in digital ISDN';
                }
                else if (firstFive === 0xD) {
                    text += 'UCI - Universal Computer Interface, ETSI DE/PS 3 01-3';
                }
                else if (firstFive === 0x10) {
                    text += 'message handling facility known to the SC';
                }
                else if (firstFive === 0x11) {
                    text += 'public X.400-based message handling system';
                }
                else if (firstFive === 0x12) {
                    text += 'Internet E-Mail';
                }
                else if (firstFive >= 0x18 && firstFive <= 0x1E) {
                    text += 'SC specific value';
                }
                else if (firstFive === 0x1F) {
                    text += 'GSM mobile station';
                }
                else {
                    text += 'reserved';
                }

                text += ')';
            }
            else {
                text += 'SME-to-SME protocol';

                if (firstFive > 0) {
                    text += ' (Unknown bitmask: ' + firstFive.toString( 2 ) + '- in case of SMS-DELIVER these indicate the SM-AL protocol being used between the SME and the MS!)';
                }
            }
        }
        else if (type === 0x40) {
            var firstSix = o & 0x3F;

            if (firstSix >= 0 && firstSix <= 7) {
                text += 'Short Message Type ' + firstSix;
            }
            else if (firstSix === 0x1F) {
                text += 'Return Call Message';
            }
            else if (firstSix === 0x3D) {
                text += 'ME Data download';
            }
            else if (firstSix === 0x3E) {
                text += 'ME De-personalization Short Message';
            }
            else if (firstSix === 0x3F) {
                text += 'SIM Data download';
            }
            else {
                text += 'reserved';
            }
        }
        else if (type === 0x80) {
            text += 'reserved';
        }
        else if (type === 0xC0) {
            text += 'SC specific use';
        }

        return text;
    },

    /**
     * Data Coding Scheme token
     *
     * {@linkplain http://www.dreamfabric.com/sms/dcs.html}
     *
     * @param {string} octet DCS octet
     * @return {Object} Object containing recognized alphabet, DCS description text
     */
    DCS: function( octet ) {
        var o = parseInt( octet, 16 );
        var text = '';
        var alphabet = 'default';
        var codingGroup = o & 0xF0;
        var result = {};

        if (codingGroup >= 0 && codingGroup <= 0x30) {
            text += 'General Data Coding groups, ';

            // noinspection JSBitwiseOperatorUsage
            if (o & 0x20) {
                text += 'compressed';
            }
            else {
                text += 'uncompressed';
            }

            text += ', ';
            var alphabetFlag = o & 0xC;

            if (alphabetFlag === 0) {
                text += 'default alphabet';
            }
            else if (alphabetFlag === 4) {
                text += '8 bit data';
                alphabet = '8bit';
            }
            else if (alphabetFlag === 8) {
                text += 'UCS2 (16 bit)';
                alphabet = 'ucs2';
            }
            else if (alphabetFlag === 0xC) {
                text += 'reserved alphabet';
            }
        }
        else if (codingGroup >= 0x40 && codingGroup <= 0xB0) {
            text += 'Reserved coding groups';
        }
        else if (codingGroup === 0xC0) {
            result.action = 'discard';
            text += 'Message Waiting Indication Group: Discard Message, ';
        }
        else if (codingGroup === 0xD0) {
            result.action = 'store';
            text += 'Message Waiting Indication Group: Store Message, standard encoding, ';
        }
        else if (codingGroup === 0xE0) {
            result.action = 'store';
            text += 'Message Waiting Indication Group: Store Message, UCS2 encoding, ';
        }
        else if (codingGroup === 0xF0) {
            text += 'Data coding/message class, ';

            // noinspection JSBitwiseOperatorUsage
            if (o & 8) {
                text += '(VIOLATION: reserved bit set, but should not!), ';
            }

            // noinspection JSBitwiseOperatorUsage
            if (o & 4) {
                text += '8 bit data';
                alphabet = '8bit';
            }
            else {
                text += 'Default alphabet';
            }
        }

        if ((codingGroup >= 0 && codingGroup <= 0x30) || codingGroup === 0xF0) {
            text += ', ';

            var isMsgClassSet = true;

            if ((codingGroup >= 0 && codingGroup <= 0x30) && (o & 0x10) === 0) {
                isMsgClassSet = false;
                text += ' no message class set (but given bits would be: ';
            }

            var msgClassId = o & 3;

            text += 'Class ' + msgClassId + ' - ';

            if (msgClassId === 0) {
                result.class = 'Flash';
                text += 'immediate display';
            }
            else if (msgClassId === 1) {
                result.class = 'ME';
                text += 'ME specific';
            }
            else if (msgClassId === 2) {
                result.class = 'SIM';
                text += 'SIM specific';
            }
            else if (msgClassId === 3) {
                result.class = 'TE';
                text += 'TE specific';
            }

            if (!isMsgClassSet) {
                result.class = undefined;
            }

            text += ')';

        }

        if (codingGroup >= 0xC0 && codingGroup <= 0xE0) {
            // noinspection JSBitwiseOperatorUsage
            if (o & 8) {
                result.active = true;
                text += 'Set Indication Active';
            }
            else {
                result.active = false;
                text += 'Set Indication Inactive';
            }

            text += ', ';

            // noinspection JSBitwiseOperatorUsage
            if (o & 4) {
                text += '(reserved bit set, but should not!), ';
            }

            var indicationType = o & 3;

            if (indicationType === 0) {
                result.unread = 'Voicemail';
                text += 'Voicemail Message Waiting';
            }
            else if (indicationType === 1) {
                result.unread = 'Fax';
                text += 'Fax Message Waiting';
            }
            else if (indicationType === 2) {
                result.unread = 'E-mail';
                text += 'E-Mail Message Waiting';
            }
            else if (indicationType === 3) {
                result.unread = 'Other';
                text += 'Other Message Waiting (not yet standardized)';
            }
        }

        result.alphabet = alphabet;

        return result;
    },

    /**
     * Service Center Time Stamp token
     *
     * {@linkplain http://www.dreamfabric.com/sms/scts.html}
     *
     * @param {Array<string>} octets containing SCTS in BCD inverted nibble format
     * @return {string} TimeStamp in format 'YYYY-MM-DD HH:MM:SS GMT +/-X'
     */
    SCTS: function( octets ) {
        var i;

        for (i = 0; i < 7; ++i) {
            octets[ i ] = reverse( octets[ i ] );
        }

        var ts = '';

        if (parseInt( octets[0], 10 ) < 70) {
            ts += '20';
        }
        else {
            ts += '19';
        }

        ts += octets[0] + '-' + octets[1] + '-' + octets[2] + ' ' + octets[3] + ':' + octets[4] + ':' + octets[5] + ' GMT ';

        var tz = parseInt( octets[6], 10 );

        // noinspection JSBitwiseOperatorUsage
        if (tz & 0x80) {
            tz = tz & 0x7F;
            ts += '-';
        }
        else {
            ts += '+';
        }

        return ts + tz / 4;
    },

    /**
     * User Data Length token
     *
     * @param {string} octet UDL octet
     * @param {string} alphabet type
     * @return {Object} length by septets and octets, info text
     */
    UDL: function( octet, alphabet ) {
        var o = parseInt( octet, 16 );
        var length = 0;
        var chars = o;

        if (alphabet === 'default') {
            length = Math.ceil( o * 70 / 80 );
        }
        else {
            length = o;
        }

        if (alphabet === 'ucs2') {
            chars = length / 2;
        }

        return {
            septets: o,
            octets: length,
            info: chars + ' characters, ' + length + ' bytes'
        };
    },

    /**
     * User Data Header Length token
     *
     * Evaluates the length of the User Data Header and the padding to the next septet start
     *
     * {@linkplain http://mobiletidings.com/2009/02/18/combining-sms-messages/}
     *
     * @param {string} octet UDHL octet
     * @param {string} alphabet type ('default', '8bit', 'ucs2')
     * @return {Object} UDH length in octets / bytes, padding in no. of bits, info text
     */
    UDHL: function( octet, alphabet ) {
        var length = parseInt( octet, 16 );
        var padding = 0;

        if (alphabet === 'default') {
            var udhBitLength = (length + 1) * 8;
            var nextSeptetStart =  Math.ceil( udhBitLength / 7 ) * 7;

            padding = nextSeptetStart - udhBitLength;
        }

        return {
            length: length,
            padding: padding,
            info: length + ' bytes'
        };
    },

    /**
     * User Data Header token
     *
     * Recognizes some Information Elements (IE): concatenated SMS, usage of WAP protocol stack,
     * some well-known destination ports, some EMS text formatting
     *
     * {@linkplain http://mobiletidings.com/2009/02/18/combining-sms-messages/}
     * {@linkplain http://mobiletidings.com/2009/02/21/wap-push-over-sms-encodings/}
     * {@linkplain http://mobiletidings.com/2009/02/26/wap-push-over-sms-si-encoding/}
     * {@linkplain http://mobiletidings.com/2009/03/12/text-formatting-sms-ems/}
     * {@linkplain http://www.csoft.co.uk/sckl/index.htm}
     *
     * @param {Array<string>} octets containing UDH
     * @return {Object} Wap indication, array of EMS text formatter callbacks, info text
     */
    UDH: function( octets ) {
        var i,
            IEs = [],		// all Information Elements
            IE = {},		// actual Information Element
            info = [],
            text = '',
            isWap = false,
            destPort,
            isEMS = false,
            formatting = [],
            ems = [],
            parts = {},
            style,
            format,
            color;

        // break up Information Elements
        while (octets.length) {
            var o = parseInt( octets.shift(), 16 );

            if (IE.IEI === undefined) {
                IE.IEI = o;		// Information Element Identifier
            }
            else if (IE.IEDL === undefined) {
                IE.IEDL = o;	// Information Element Data Length
            }
            else {
                if (IE.IED === undefined) {
                    IE.IED = [];
                }
                IE.IED.push( o );

                if (IE.IED.length >= IE.IEDL) {
                    IEs.push( IE );
                    IE = {};
                }
            }
        }

        // Wireless Datagram Protocol IE
        for (i = 0; i < IEs.length; ++i) {
            if (IEs[ i ].IEI === 5) {
                destPort = IEs[ i ].IED[0] * 256 + IEs[ i ].IED[1];

                if (destPort === 5505) {
                    destPort += ' (Ring Tone)';
                }
                else if (destPort === 5506) {
                    destPort += ' (Operator Logo)';
                }
                else if (destPort === 5507) {
                    destPort += ' (Group Graphic - CLI Logo)';
                }
                else if (destPort === 9200) {
                    destPort += ' (Connectionless WAP browser proxy server)';
                }
                else if (destPort === 9202) {
                    destPort += ' (Secure connectionless WAP browser proxy server)';
                }
                else if (destPort === 9203) {
                    destPort += ' (Secure WAP Browser proxy server)';
                }
                else if (destPort === 9204) {
                    destPort += ' (vCard)';
                }
                else if (destPort === 9205) {
                    destPort += ' (vCalendar)';
                }
                else if (destPort === 9206) {
                    destPort += ' (Secure vCard)';
                }
                else if (destPort === 9207) {
                    destPort += ' (Secure vCalendar)';
                }
                else {
                    isWap = true;
                }

                text = 'WDP (Wireless Datagram Protocol): Destination port is ' + destPort + ', source port is ' + (IEs[ i ].IED[2] * 256 + IEs[ i ].IED[3]);

                if (IEs[ i ].IEDL !== 4) {
                    text += ' (VIOLATON: This Information Element should have exactly 4 bytes but says it has ' + IEs[ i ].IEDL + ' instead!)';
                }
                if (IEs[i].IED.length !== 4) {
                    text += ' (VIOLATION: This Information Element should have exactly 4 bytes but actually has ' + IEs[i].IED.length + ' instead!)';
                }

                info.push( text );
            }

            // Concatenation IE
            else if (IEs[ i ].IEI === 0) {
                parts.ref   = IEs[ i ].IED[0];
                parts.part  = IEs[ i ].IED[2];
                parts.total = IEs[ i ].IED[1];

                text = 'Concatenated message: reference number ' + parts.ref + ', part ' + parts.part + ' of ' + parts.total + ' parts';

                if (IEs[ i ].IEDL !== 3) {
                    text += ' (VIOLATON: This Information Element should have exactly 3 bytes but says it has ' + IEs[ i ].IEDL + ' instead!)';
                }
                if (IEs[i].IED.length !== 3) {
                    text += ' (VIOLATION: This Information Element should have exactly 3 bytes but actually has ' + IEs[i].IED.length + ' instead!)';
                }

                info.push( text );
            }

            else if (IEs[ i ].IEI === 8) {
                parts.ref   = IEs[ i ].IED[0] * 256 + IEs[ i ].IED[1];
                parts.part  = IEs[ i ].IED[3];
                parts.total = IEs[ i ].IED[2];

                text = 'Concatenated message: 16bit reference number ' + parts.ref + ', part ' + parts.part + ' of ' + parts.total + ' parts';

                if (IEs[ i ].IEDL !== 4) {
                    text += ' (VIOLATON: This Information Element should have exactly 3 bytes but says it has ' + IEs[ i ].IEDL + ' instead!)';
                }
                if (IEs[i].IED.length !== 4) {
                    text += ' (VIOLATION: This Information Element should have exactly 3 bytes but actually has ' + IEs[i].IED.length + ' instead!)';
                }

                info.push( text );
            }

            // EMS formatting IE
            else if (IEs[ i ].IEI === 10) {
                isEMS = true;

                style = [];
                format = IEs[ i ].IED[2];


                if ((format & 3) === 1) {
                    style.push( 'text-align: center' );
                }
                else if ((format & 3) === 2) {
                    style.push( 'text-align: right' );
                }

                if ((format & 0xC) === 4) {
                    style.push( 'font-size: large' );
                }
                else if ((format & 0xC) === 8) {
                    style.push( 'font-size: small' );
                }

                // noinspection JSBitwiseOperatorUsage
                if (format & 0x20) {
                    style.push( 'font-style: italic' );
                }

                // noinspection JSBitwiseOperatorUsage
                if (format & 0x10) {
                    style.push( 'font-weight: bold' );
                }

                // noinspection JSBitwiseOperatorUsage
                if (format & 0x40) {
                    style.push( 'text-decoration: underline' );
                }

                // noinspection JSBitwiseOperatorUsage
                if (format & 0x80) {
                    style.push( 'text-decoration: line-through' );
                }

                color = IEs[ i ].IED[3];

                if (color) {
                    if ((color & 0xF) === 1) {
                        style.push( 'color: darkGray' );
                    }
                    else if ((color & 0xF) === 2) {
                        style.push( 'color: darkRed' );
                    }
                    else if ((color & 0xF) === 3) {
                        style.push( 'color: GoldenRod' );
                    }
                    else if ((color & 0xF) === 4) {
                        style.push( 'color: darkGreen' );
                    }
                    else if ((color & 0xF) === 5) {
                        style.push( 'color: darkCyan' );
                    }
                    else if ((color & 0xF) === 6) {
                        style.push( 'color: darkBlue' );
                    }
                    else if ((color & 0xF) === 7) {
                        style.push( 'color: darkMagenta' );
                    }
                    else if ((color & 0xF) === 8) {
                        style.push( 'color: gray' );
                    }
                    else if ((color & 0xF) === 9) {
                        style.push( 'color: white' );
                    }
                    else if ((color & 0xF) === 0xA) {
                        style.push( 'color: red' );
                    }
                    else if ((color & 0xF) === 0xB) {
                        style.push( 'color: yellow' );
                    }
                    else if ((color & 0xF) === 0xC) {
                        style.push( 'color: green' );
                    }
                    else if ((color & 0xF) === 0xD) {
                        style.push( 'color: cyan' );
                    }
                    else if ((color & 0xF) === 0xE) {
                        style.push( 'color: blue' );
                    }
                    else if ((color & 0xF) === 0xF) {
                        style.push( 'color: magenta' );
                    }

                    if ((color & 0xF0) === 0) {
                        style.push( 'background-color: black' );
                    }
                    else if ((color & 0xF0) === 0x10) {
                        style.push( 'background-color: darkGray' );
                    }
                    else if ((color & 0xF0) === 0x20) {
                        style.push( 'background-color: darkRed' );
                    }
                    else if ((color & 0xF0) === 0x30) {
                        style.push( 'background-color: GoldenRod' );
                    }
                    else if ((color & 0xF0) === 0x40) {
                        style.push( 'background-color: darkGreen' );
                    }
                    else if ((color & 0xF0) === 0x50) {
                        style.push( 'background-color: darkCyan' );
                    }
                    else if ((color & 0xF0) === 0x60) {
                        style.push( 'background-color: darkBlue' );
                    }
                    else if ((color & 0xF0) === 0x70) {
                        style.push( 'background-color: darkMagenta' );
                    }
                    else if ((color & 0xF0) === 0x80) {
                        style.push( 'background-color: gray' );
                    }
                    else if ((color & 0xF0) === 0x90) {
                        style.push( 'background-color: white' );
                    }
                    else if ((color & 0xF0) === 0xA0) {
                        style.push( 'background-color: red' );
                    }
                    else if ((color & 0xF0) === 0xB0) {
                        style.push( 'background-color: yellow' );
                    }
                    else if ((color & 0xF0) === 0xC0) {
                        style.push( 'background-color: green' );
                    }
                    else if ((color & 0xF0) === 0xD0) {
                        style.push( 'background-color: cyan' );
                    }
                    else if ((color & 0xF0) === 0xE0) {
                        style.push( 'background-color: blue' );
                    }
                    else if ((color & 0xF0) === 0xF0) {
                        style.push( 'background-color: magenta' );
                    }
                }

                if (style.length) {
                    IEs[ i ].markupOpen = '<span style="' + style.join( '; ' ) + '">';
                    IEs[ i ].markupClose = '</span>';
                }
                else {
                    IEs[ i ].markupOpen = '';
                    IEs[ i ].markupClose = '';
                }

                ems.push( IEs[ i ] );

                formatting.push( function( text, original, i ) {
                    original = original.substr( ems[ i ].IED[0], ems[ i ].IED[1] );

                    var getPart = new RegExp( original );

                    return text.replace( getPart, ems[ i ].markupOpen + original + ems[ i ].markupClose );
                } );

            }
        }

        if (isEMS) {
            info.push( 'has EMS formatting' );
        }

        var result = {};

        if (isWap) result.wap = true;
        if (formatting.length) result.formatting = formatting;
        if (1) result.IEs = IEs;
        if (Object.keys (parts).length) result.parts = parts;
        if (1) result.info = info.join( '; ' );

        return result;

    },

    /**
     * User Data token
     *
     * Tries to decode the user data:
     * - default 7 Bit charset
     * - UCS2 2 byte decoding
     * - Fallback to ASCII decoding, often one can see some useful information there (e.g. name of wallpaper)
     *
     * {@linkplain http://www.dreamfabric.com/sms/hello.html}
     *
     * @param {Array<string>} octets
     * @param {string} alphabet type ('default', '8bit', 'ucs2')
     * @param {number?} padding in no. of bits from UDHL (optional)
     * @param {Array<Function>} formatting EMS formatter callbacks
     * @return {string} Decoded user data
     */
    UD: function( octets, alphabet, padding, formatting ) {
        var thisChar, original,
            text = '',
            i = 0;

        if (alphabet === 'default') {
            text = decode7Bit( octets, padding );
        }
        else if (alphabet === 'ucs2') {
            while (octets.length) {
                thisChar = octets.shift() + octets.shift();
                text += String.fromCharCode( parseInt( thisChar, 16 ) );
            }
        }
        else {
            text += '(';

            if (alphabet === '8bit') {
                text += 'unknown binary data';
            }
            else {
                text += 'unrecognized alphpabet';
            }

            text += ', try ASCII decoding) ';

            while (octets.length) {
                text += String.fromCharCode( parseInt( octets.shift(), 16 ) );
            }
        }

        // Execute EMS formatting
        if (formatting && formatting.length) {
            original = text;
            for (i = 0; i < formatting.length; i++) {
                text = formatting[ i ]( text, original, i );
            }
        }

        return text;
    },

    /**
     * Message Reference token (only on PDU type 'submit')
     *
     * @param {string} octet
     * @return {string} Info text
     */
    MR: function( octet ) {
        if (octet === '00') {
            return 'Mobile equipment sets reference number';
        }
        return '0x' + octet;
    },

    /**
     * Validity Period token (only on PDU type 'submit')
     * This only handles the relative type, absolute and enhanced are timestamps like SCTS
     *
     * {@linkplain http://www.dreamfabric.com/sms/vp.html}
     *
     * @param {string} octet
     * @return {string} info text
     */
    VPrelative: function( octet ) {
        var vp = parseInt( octet, 16 );
        var text = '';

        if (vp < 144) {
            text = ((vp + 1) * 5) + ' minutes';
        }
        else if (vp > 143 && vp < 168) {
            text = ((vp - 143) * 30 / 60 + 12) + ' hours';
        }
        else if (vp > 167 && vp < 197) {
            text = (vp - 166 ) + ' days';
        }
        else if (vp > 186) {
            text = (vp - 192) + ' weeks';
        }

        return text;
    }

};

/**
 * Encode text to GSM-7 encoding
 * @param   {[[Type]]} inTextNumberArray [[Description]]
 * @param   {[[Type]]} [paddingBits=0]   [[Description]]
 * @returns {[[Type]]} [[Description]]
 */
function encode7Bit (inTextNumberArray, paddingBits) {
    //as explained here http://mobiletidings.com/2009/07/06/how-to-pack-gsm7-into-septets/
    var paddingBits = paddingBits || 0;
    var bits = 0;
    var out = "";

    if (paddingBits) {
            bits = 7 - paddingBits;
            var octet = (inTextNumberArray[0] << (7 - bits)) % 256
            out += ('00' + octet.toString(16)).slice(-2); // zero padded
            bits++;
        }

    for(var i = 0; i < inTextNumberArray.length; i++ ) {
        if (bits == 7) {
            bits = 0;
            continue;
        }
        var octet = (inTextNumberArray[i] & 0x7f) >> bits;
        if (i < inTextNumberArray.length - 1 ) {
            octet |= (inTextNumberArray[i + 1] << (7 - bits)) % 256;
        }
        out += ('00' + octet.toString(16)).slice(-2); // zero padded
        bits++;
    }
    return out.toUpperCase();
}

function try7Bit (message) {
    //7bit GSM encoding according to GSM_03.38 character set http://en.wikipedia.org/wiki/GSM_03.38
    var data = [];
    var is7Bits = message.split ('').every (function (char) {
        var int = gsm7Reverse[char];
        if (int === undefined)
            return false;
        data = data.concat (int);
        return true;
    });
    if (!is7Bits)
        return;
    return data;
}

function encodeAddress (address) {
    var addressFormat = "81"; // national
    if (address[0] === '+') {
        addressFormat = "91"; // international
        address = address.substr(1);
    } else if (address[0] !== '0') {
        // addressFormat = "91"; // international
    }

    /*
    The Address-Length field is an integer representation of the number
    of useful semi-octets within the Address-Value field,
    i.e. excludes any semi octet containing only fill bits.
    */
    var addressLength = address.length.toString(16).toUpperCase ();
    if (addressLength.length < 2)
        addressLength = '0' + addressLength;

    if (address.length % 2) {
      address += "F";
    }

    var encoded = address.split ('').map (function (char, idx, chars) {
        if (idx % 2) return '';
        return chars[idx + 1] + char;
    });

    return [].concat (addressLength, addressFormat, encoded).join ('');

}

function encode16Bit (data) {
    var out = '';
    for(var i = 0; i < data.length; i++) {
        out += ('0000'+(data[i].toString(16))).slice(-4);
    }
    return out;
}

function randomHexa (size) {
    var text = "";
    var possible = "0123456789ABCDEF";
    while (text.length < size) {
        text += possible[Math.floor(Math.random() * (possible.length - 1))];
    }
    return text;
}


function stringify (message) {
    var pdu = '00'; // SCA = Service Centre Address
    var parts = 1;

    var msgCharcodeArray = try7Bit (message.userData);
    var encoding = 'default';

    if (!msgCharcodeArray) {
        msgCharcodeArray = message.userData.split ('').map (function (char) {return char.charCodeAt (0)});
        encoding = 'ucs2';
    }

    if(encoding === 'ucs2' && msgCharcodeArray.length > 70)
        parts = msgCharcodeArray.length / 66;

    else if(encoding === 'default' && msgCharcodeArray.length > 160)
        parts = msgCharcodeArray.length / 153;

    parts = Math.ceil(parts);

    var TPMTI  = 1,
        TPRD   = 4,
        TPVPF  = 8,
        TPSRR  = 32,
        TPUDHI = 64,
        TPRP   = 128;

    var submit = TPMTI;

    if(parts > 1) //UDHI
        submit = submit | TPUDHI;

    submit = submit | TPSRR;

    pdu += submit.toString(16);

    pdu += '00'; //TODO: Reference Number;
    /*
    The TP-Message-Reference field gives an integer representation of a reference number of the SMS-SUBMIT or SMS-COMMAND submitted to the SC by the MS. The MS increments TP-Message-Reference by 1 for each SMS-SUBMIT or SMS-COMMAND being submitted. The value to be used for each SMS-SUBMIT is obtained by reading the Last-Used-TP-MR value from the SMS Status data field in the SIM (see TS GSM 11.11) and incrementing this value by 1. After each SMS-SUBMIT has been submitted to the network, the Last-Used-TP-MR value in the SIM is updated with the TP-MR that was used in the SMS-SUBMIT operation. The reference number may possess values in the range 0 to 255. The value in the TP-MR assigned by the MS is the same value which is received at the SC.
    */


    pdu += encodeAddress (message.address);

    // pdu += receiverSize.toString(16) + receiverType + receiver;

    pdu += '00'; //TODO TP-PID

    /*
    0 to 143: (TP-VP + 1) x 5 minutes (i.e. 5 minutes intervals up to 12 hours)

    144 to 167: 12 hours + ((TP-VP -143) x 30 minutes)

    168 to 196: (TP-VP - 166) x 1 day

    197 to 255: (TP-VP - 192) x 1 week
    */

    if(encoding === 'ucs2')
        pdu += '08';
    else if(encoding === 'default')
        pdu += '00';

    var pdus = new Array();

    var csms = randomHexa(2); // CSMS allows to give a reference to a concatenated message

    for(var i=0; i< parts; i++) {
        pdus[i] = pdu;

        if(encoding === 'ucs2') {
            /* If there are more than one messages to be sent, we are going to have to put some UDH. Then, we would have space only
             * for 66 UCS2 characters instead of 70 */
            if(parts === 1)
                var length = 70;
            else
                var length = 66;

        } else if(encoding === 'default') {
            /* If there are more than one messages to be sent, we are going to have to put some UDH. Then, we would have space only
             * for 153 ASCII characters instead of 160 */
            if(parts === 1)
                var length = 160;
            else
                var length = 153;
        }
        var text = msgCharcodeArray.slice(i*length, (i*length)+length);

        var userData;

        if(encoding === 'ucs2') {
            userData = encode16Bit(text);
            var size = (userData.length / 2);

            if(parts > 1)
                size += 6; //6 is the number of data headers we append.

        } else if(encoding === 'default') {
            if(parts > 1){
                userData = encode7Bit(text,1);
                var size = 7 + text.length;
            }
            else {
                userData = encode7Bit(text);
                var size = text.length;
            }
        }

        pdus[i] += ('00'+parseInt(size).toString(16)).slice(-2);

        if(parts > 1) {
            pdus[i] += '05';
            pdus[i] += '00';
            pdus[i] += '03';
            pdus[i] +=  csms;
            pdus[i] += ('00'+parts.toString(16)).slice(-2);
            pdus[i] += ('00'+(i+1).toString(16)).slice(-2);
        }
        pdus[i] += userData;
    }

    return pdus;
}


/**
 * Decodes all given octets to a string using the GSM 7-bit encoding.
 *
 * @param {Array<string>} octets
 * @param {number?} padding in no. of bits from UDHL (optional)
 * @returns {string} the readable content of the given octets.
 */
function decode7Bit( octets, padding ) {
    var thisAndNext, thisChar, character,
        nextChar = '',
        text = '';

    if (padding && octets.length) {
        nextChar = padwZeros( parseInt( octets.shift(), 16 ).toString( 2 ) );
        nextChar = nextChar.substring( 0, nextChar.length - padding );
    }

    while (octets.length || parseInt( nextChar, 2 )) {
        thisAndNext = getChar( octets, nextChar );
        thisChar = thisAndNext[0];
        nextChar = thisAndNext[1];
        character = gsm7bit[ parseInt( thisChar, 2 ) ];

        // Extension table on 0x1B
        if (typeof character === 'object') {
            thisAndNext = getChar( octets, nextChar );
            thisChar = thisAndNext[0];
            nextChar = thisAndNext[1];
            character = character[ parseInt( thisChar, 2 ) ];
        }

        text += character ? character : '';
    }

    return text;
}

/**
 * Decodes septets-in-octets encoding of the GSM 7 Bit character set
 *
 * @param {Array<string>} octets
 * @param {string} nextChar
 * @return {Array<string>} 7 digit bitstream string representing the current decoded character and parts of the next one.
 */
function getChar( octets, nextChar ) {
    if (nextChar.length === 7) {
        return [nextChar, ''];
    }

    var octet = padwZeros( parseInt( octets.shift(), 16 ).toString( 2 ) );
    var bitsFromNextChar = nextChar.length + 1;
    var thisChar = octet.substr( bitsFromNextChar ) + nextChar;
    nextChar = octet.substr( 0, bitsFromNextChar );

    return [thisChar, nextChar];
}

/**
 * Reverse an octet
 *
 * Used to decode BCD inversed nibbles format
 *
 * @param {string} octet
 * @return {string} Reversed octet
 */
function reverse( octet ) {
    if (typeof octet === 'string') {
        return octet.substr( 1, 1 ) + octet.substr( 0, 1 );
    }
    else {
        return '00';
    }
}

/**
 * Pads a bitsream in a string with zeros as long as its shorter than 8 digits
 *
 * @param {string} bitstream
 * @return {string} a Zero-padded binary bitstream
 */
function padwZeros( bitstream ) {
    while (bitstream.length < 8) {
        bitstream = '0' + bitstream;
    }

    return bitstream;
}

/**
 * GSM 7 bit default alphabet lookup table
 *
 * {@linkplain http://www.dreamfabric.com/sms/default_alphabet.html}
 */
var gsm7bit = {
    0: '@', 1: '£', 2: '$', 3: '¥', 4: 'è', 5: 'é', 6: 'ù', 7: 'ì', 8: 'ò', 9: 'Ç',
    10:'\n', 11: 'Ø', 12: 'ø', 13: '\r', 14: 'Å', 15: 'å', 16: '\u0394', 17: '_', 18: '\u03a6', 19: '\u0393',
    20: '\u039b', 21: '\u03a9', 22: '\u03a0', 23: '\u03a8', 24: '\u03a3', 25: '\u0398', 26: '\u039e', 28: 'Æ', 29: 'æ',
    30: 'ß', 31: 'É', 32: ' ', 33: '!', 34: '"', 35: '#', 36: '¤', 37: '%', 38: '&', 39: '\'',
    40: '(', 41: ')', 42: '*', 43: '+', 44: ',', 45: '-', 46: '.', 47: '/', 48: '0', 49: '1',
    50: '2', 51: '3', 52: '4', 53: '5', 54: '6', 55: '7', 56: '8', 57: '9', 58: ':', 59: ';',
    60: '<', 61: '=', 62: '>', 63: '?', 64: '¡', 65: 'A', 66: 'B', 67: 'C', 68: 'D', 69: 'E',
    70: 'F', 71: 'G', 72: 'H', 73: 'I', 74: 'J', 75: 'K', 76: 'L', 77: 'M', 78: 'N', 79: 'O',
    80: 'P', 81: 'Q', 82: 'R', 83: 'S', 84: 'T', 85: 'U', 86: 'V', 87: 'W', 88: 'X', 89: 'Y',
    90: 'Z', 91: 'Ä', 92: 'Ö', 93: 'Ñ', 94: 'Ü', 95: '§', 96: '¿', 97: 'a', 98: 'b', 99: 'c',
    100: 'd', 101: 'e', 102: 'f', 103: 'g', 104: 'h', 105: 'i', 106: 'j', 107: 'k', 108: 'l', 109: 'm',
    110: 'n', 111: 'o', 112: 'p', 113: 'q', 114: 'r', 115: 's', 116: 't', 117: 'u', 118: 'v', 119: 'w',
    120: 'x', 121: 'y', 122: 'z', 123: 'ä', 124: 'ö', 125: 'ñ', 126: 'ü', 127: 'à',
    27: {
        10: '\n', // Should be FORM-FEED but no good here
        20: '^', 40: '{', 41: '}', 47: '\\',
        60: '[', 61: '~', 62: ']', 64: '|', 101: '\u20ac' // €
    }
};

var gsm7Reverse = {};
Object.keys (gsm7bit).forEach (function (charCode) {
    if (charCode !== 27)
        gsm7Reverse[gsm7bit[charCode]] = charCode;
});

Object.keys (gsm7bit[27]).forEach (function (charCode) {
    gsm7Reverse[gsm7bit[27][charCode]] = [27, charCode];
});


module.exports = {
    parse:   parsePdu,
    decode:        decodePdu,
    encodeAddress: encodeAddress,
    encode7Bit:    encode7Bit,
    try7Bit:       try7Bit,
    stringify:     stringify,
};
