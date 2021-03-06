/*  nodejs-poolController.  An application to control pool equipment.
Copyright (C) 2016, 2017, 2018, 2019, 2020.  Russell Goldin, tagyoureit.  russ.goldin@gmail.com

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/
import { Inbound } from "../Messages";
import { state } from "../../../State";
import { sys, ControllerType } from "../../../Equipment";
import { logger } from "../../../../logger/Logger";
import { webApp } from "../../../../web/Server";
export class IntelliChemStateMessage {
    public static process(msg: Inbound) {
        if (sys.controllerType === ControllerType.Unknown) return;
        if (msg.source < 144 || msg.source > 158) return;
        switch (msg.action) {

            // ---------- IntelliChem set get ----------- //
            case 18: // IntelliChem is sending us it's status.
                IntelliChemStateMessage.processState(msg);
                break;
            case 210: // OCP is asking IntelliChem controller for it's current status info.
                // [165,0,144,16,210,1],[210],[2,234]
                msg.isProcessed = true;
                break;
            // ---------- End IntelliChem set get ----------- //

            // ---------- OCP set get ----------- //
            case 19: // Request to OCP to return the status that ic currently has.
                // [165,14,16,34,19,1],[0],[0,249]
                break;

            /* RKS: This is processed in the IntellichemMessage.processTouch() and is the results of asking for the IntelliChem configuration.
            case 147: // OCP is broadcasting it's known ic values...  Need to change our settings if virtual.
                // 147 is a proto:broadcast message; 
                // it has exactly the same format as 18 but there is payload[0] which is inserted at the beginning.  Likely the chem controller id.
                if (msg.dest < 144 || msg.dest > 158) return;
                IntelliChemStateMessage.processControllerChange(msg);
                break;
            // ---------- End OCP set get ----------- //
            */
            // ---------- ICP or SL set get ----------- //
            case 211: // SL or other controller is telling OCP to set IntelliChem value
                // It will take these values and pass them in 146 to IntelliChem
                // values that are NOT SET should be ignored
                msg.isProcessed = true;
                break;
            case 146: // OCP is telling IntelliChem that it needs to change its settings to...
                let address = msg.dest;
                // The address is king here.  The id is not.
                let controller = sys.chemControllers.getItemByAddress(address, true);
                let scontroller = state.chemControllers.getItemById(controller.id, true);
                if (scontroller.lastComm + (30 * 1000) < new Date().getTime()) {
                    // We have not talked to the chem controller in 30 seconds so we have lost communication.
                    scontroller.status = scontroller.alarms.comms = 1;                   
                }
                controller.ph.tank.capacity = controller.orp.tank.capacity = 6;
                controller.ph.tank.units = controller.orp.tank.units = '';
                msg.isProcessed = true;
                break;
            // ---------- OCP set get ----------- //
        }
        state.emitEquipmentChanges();
    }
    private static processControllerChange(msg: Inbound) {
        // We don't do anything with this inbound action 147 message.
        logger.info(`Incoming message from IntelliChem ${msg.toShortPacket()}`);
        msg.isProcessed = true;
    }
    private static processState(msg: Inbound) {
        if (msg.source < 144 || msg.source > 158) return;
        // This is an action 18 that comes from IntelliChem.  There is also a 147 that comes from an OCP but this is the raw data.
        //[165, 0, 16, 144, 18, 41][2,228,3,2,2,228,2,188,0,0,0,16,0,0,0,0,0,35,0,0,6,6,3,0,250,0,44,0,160,20,0,81,8,0,149,0,80,1,0,0,0]
        //      Bytes - Descrption
        //      0-1 : pH byte(0) x 256 + byte(1) / 100
        //      2-3 : ORP byte(2) x 256 + byte(3)
        //      4-5 : pH Setpoint : byte(4) x 256 + byte(5) / 100
        //      6-7 : ORP Setpoint : byte(6) x 256 + byte(7)
        //      8 : Unknown = 0
        //      9 : Unknown = 0
        //      10 : Unknown = 0
        //      11-12 : pH Dose time seconds. The number of seconds since the dose started. byte(11) x 256 + byte(12)
        //      13 : Unknown
        //      14-15 : ORP Dose time seconds.  The number of seconds since the dose started. byte(14) x 256 + byte(15)
        //      16-17 : pH Dose volume (unknown units) - These appear to be mL.
        //      18-19 : ORP Dose volume (unknown units) - These appear to be mL
        //      20 : pH tank level 1-7
        //      21 : ORP tank level 1-7
        //      22 : LSI. (byte(22) & 0x80) === 0x80 ? (256 - byte(22) / -100 : byte(22)/100
        //      23-24 : Calcium Hardness = byte(23) x 256 + byte(24) = 250
        //      25 : Unknown = 0 (probably reserved CYA byte so the controller is always dealing with integers)
        //      26 : CYA Max value = 210.
        //      27-28 : Alkalinity = byte(27) x 256 + byte(28)
        //      29 : Salt level = byte(29) x 50
        //      30 : Unknown
        //      31 : Temperature
        //      32 : Alarms
        //      33 : Warnings pH Lockout, Daily Limit Reached, Invalid Setup, Chlorinator Comm error
        //      34 : Dosing Status (pH Monitoring, ORP Mixing)
        //      35 : Delays
        //      36-37 : Firmware = 80,1 = 1.080
        //      38 : Water Chemistry Warning (Corrosion...)
        //      39 : Unknown
        //      40 : Unknown
        let address = msg.source;
        // The address is king here.  The id is not.
        let controller = sys.chemControllers.getItemByAddress(address, true);
        let scontroller = state.chemControllers.getItemById(controller.id, true);
        scontroller.isActive = controller.isActive = true;
        scontroller.status = 0;
        scontroller.type = controller.type = sys.board.valueMaps.chemControllerTypes.getValue('intellichem');
        controller.name = controller.name || `IntelliChem ${controller.address - 143}`; // default to true id if no name is set
        scontroller.lastComm = new Date().getTime();
        scontroller.status = scontroller.alarms.comms = 0; 
        controller.ph.tank.capacity = controller.orp.tank.capacity = 6;
        controller.ph.tank.units = controller.orp.tank.units = '';
        
        scontroller.address = controller.address;
        scontroller.ph.level = scontroller.ph.probe.level = msg.extractPayloadIntBE(0) / 100;
        scontroller.orp.level = scontroller.orp.probe.level = msg.extractPayloadIntBE(2);
        controller.ph.setpoint = msg.extractPayloadIntBE(4) / 100;
        controller.orp.setpoint = msg.extractPayloadIntBE(6);
        // Missing information on the related bytes.
        // Bytes 8-14 (Probably Total Dissolved Solids in here if no IntelliChlor)

        //      11-12 : pH Dose time
        scontroller.ph.doseTime = (msg.extractPayloadByte(11) * 256) + msg.extractPayloadByte(12);
        //      14-15 : ORP Dose time seconds.  The number of seconds since the dose started.
        scontroller.orp.doseTime = (msg.extractPayloadByte(14) * 256) + msg.extractPayloadByte(15);
        //      16-17 : pH Dose volume (unknown units) = 35
        scontroller.ph.doseVolume = (msg.extractPayloadByte(16) * 256) + msg.extractPayloadByte(17);
        //      18-19 : ORP Dose volume (unknown units) = 0
        scontroller.orp.doseVolume = (msg.extractPayloadByte(18) * 256) + msg.extractPayloadByte(19);
        //      20 : pH tank level 1-7 = 6
        scontroller.ph.tank.level = Math.max(msg.extractPayloadByte(20) > 0 ? msg.extractPayloadByte(20) - 1 : msg.extractPayloadByte(20), 0); // values reported as 1-7; possibly 0 if no tank present
        //      21 : ORP tank level 1-7 = 6
        scontroller.orp.tank.level = Math.max(msg.extractPayloadByte(21) > 0 ? msg.extractPayloadByte(21) - 1 : msg.extractPayloadByte(21), 0); // values reported as 1-7; possibly 0 if no tank present
        //      22 : LSI = 3 & 0x80 === 0x80 ? (256 - 3) / -100 : 3/100 = .03
        let lsi = msg.extractPayloadByte(22);
        scontroller.saturationIndex = (lsi & 0x80) === 0x80 ? (256 - lsi) / -100 : lsi / 100;
        //      23-24 : Calcium Hardness = 0x256+250 = 250
        controller.calciumHardness = (msg.extractPayloadByte(23) * 256) + msg.extractPayloadByte(24);
        //      26 : CYA = 44
        controller.cyanuricAcid = msg.extractPayloadByte(26);
        //      27-28 : Alkalinity
        controller.alkalinity = (msg.extractPayloadByte(27) * 256) + msg.extractPayloadByte(28);
        //      29 : Salt level = 20 
        if (sys.chlorinators.length > 0) {
            let chlor = state.chlorinators.find(elem => elem.id === 1);
            scontroller.orp.probe.saltLevel = (typeof chlor !== 'undefined') ? chlor.saltLevel : msg.extractPayloadByte(29) * 50;
        }
        else scontroller.orp.probe.saltLevel = 0;
        //      31 : Temperature = 81
        scontroller.ph.probe.temperature = msg.extractPayloadByte(31);
        scontroller.ph.probe.tempUnits = state.temps.units;
        //      32 : Alarms = 8 = (no alarm)
        const alarms = scontroller.alarms;
        alarms.flow = msg.extractPayloadByte(32) & 0x01;
        alarms.pH = msg.extractPayloadByte(32) & 0x06;
        alarms.orp = msg.extractPayloadByte(32) & 0x18;
        alarms.pHTank = msg.extractPayloadByte(32) & 0x20;
        alarms.orpTank = msg.extractPayloadByte(32) & 0x40;
        alarms.probeFault = msg.extractPayloadByte(32) & 0x80;
        //      33 : Warnings -- pH Lockout, Daily Limit Reached, Invalid Setup, Chlorinator Comm error
        const warnings = scontroller.warnings;
        warnings.pHLockout = msg.extractPayloadByte(33) & 0x01;
        warnings.pHDailyLimitReached = msg.extractPayloadByte(33) & 0x02;
        warnings.orpDailyLimitReached = msg.extractPayloadByte(33) & 0x04;
        warnings.invalidSetup = msg.extractPayloadByte(33) & 0x08;
        warnings.chlorinatorCommError = msg.extractPayloadByte(33) & 0x10;
        //      34 : Dosing Status = 149 = (pH Monitoring, ORP Mixing)
        scontroller.ph.dosingStatus = (msg.extractPayloadByte(34) & 0x30) >> 4; // mask 00xx0000 and shift bit 5 & 6
        scontroller.orp.dosingStatus = (msg.extractPayloadByte(34) & 0xC0) >> 6; // mask xx000000 and shift bit 7 & 8
        //      35 : Delays = 0
        scontroller.status = msg.extractPayloadByte(35) & 0x80 >> 7; // to be verified as comms lost
        scontroller.ph.manualDosing = (msg.extractPayloadByte(35) & 0x08) === 1 ? true : false;
        controller.orp.useChlorinator = (msg.extractPayloadByte(35) & 0x10) === 1 ? true : false;
        controller.HMIAdvancedDisplay = (msg.extractPayloadByte(35) & 0x20) === 1 ? true : false;
        controller.ph.phSupply = (msg.extractPayloadByte(35) & 0x40) === 1 ? true : false; // acid pH dosing = 1; base pH dosing = 0;
        //      36-37 : Firmware = 80,1 = 1.080
        scontroller.firmware = `${msg.extractPayloadByte(37)}.${msg.extractPayloadByte(36).toString().padStart(3, '0')}`
        //      38 : Water Chemistry Warning
        scontroller.warnings.waterChemistry = msg.extractPayloadByte(38);
        if (typeof controller.body === 'undefined') controller.body = scontroller.body = 0;
        scontroller.ph.pump.isDosing = scontroller.ph.dosingStatus === 0 && controller.ph.enabled;
        scontroller.orp.pump.isDosing = scontroller.orp.dosingStatus === 0 && controller.orp.enabled;

        scontroller.lastComm = new Date().getTime();

        // manually emit extended values
        webApp.emitToClients('chemController', scontroller.getExtended()); // emit extended data
        scontroller.hasChanged = false; // try to avoid duplicate emits
        msg.isProcessed = true;

        /*
        //Status 0x12 (18) - Intellichem Status (length 41)
        example:
                              02 E3 02  AF 02  EE  02  BC 00  00 00 02 00 00 00 2A 00 04 00 5C 06 05 18 01 90 00  00 00 96 14  00  51 00 00 65 20 3C  01 00 00 00

                               0   1 2   3 4   5 6   7 8 9 10 11 12 13 14  15 16 17 18 19 20 21  22 23  24 25 26 27  28 29 30  31 32 33  34  35 36  37 38 39 40 
        [165,16,15,16,18 41], [2 227 2 175 2 238 2 188 0 0  0  2  0  0  0  42  0  4  0 92  6  5  24  1 144  0  0  0 150 20  0  81  0  0 101  32 60   1  0  0  0]
                               ph--- orp-- ph--- orp--                                     tanks     CH---    CYA TA---    Wtr          MODE
        0-1 pH(1-2) / ORP(8-9) reading
        02 E3 - pH 2*256 + e3(227) = 739
        02 AF - ORP 2*256 + af(175) = 687

        4-5 pH settings
        D0 = 7.2 (hi/lo bits - 720 = 7.2pH)
        DA = 7.3
        E4 = 7.4
        EE = 7.5
        F8 = 7.6

        6-7 ORP settings
        02 BC = 700 (hi/lo bits)

        20-21 Tank levels; 21 is acid? 22 is chlorine?
        06 and 05

        23-24 Calcimum Hardness
        90 is CH (90 = 400; 8b = 395) hi/lo bits

        26
        00 is CYA (00 = 0; 9 = 9; c9 = 201) (does not appear to have hi/lo - 201 is max

        27-28 - Total Alkalinity
        96 is TA (96 = 150)

        30 - Water Flow Alarm (00 is ok; 01 is no flow)
        00 flow is OK
        01 flow is Alarm on (Water STOPPED)

        // todo: these are probably 2-byte status message but need to confirm
        36 Mode
        0x25 dosing (auto)?
        0x45 dosing acid (manually?)
        0x55 mixing???
        0x65 monitoring
        0x02 (12 when mixing) and 04 (27 when mixing) related???

        37
        20 Nothing
        22 Dosing Chlorine(?)
        */


        //// Missing information on the related bytes.
        //// Bytes 8-14 (Probably Total Dissolved Solids in here if no IntelliChlor)
        //// controller.waterVolume = msg.extractPayloadByte(15) * 1000;
        //// Bytes 16-19
        //scontroller.ph.dosingVolumeRemaining = msg.extractPayloadByte(17); // Previous pH Dose volume
        //scontroller.orp.dosingVolumeRemaining = msg.extractPayloadByte(19); // Previous ORP Dose volume
        //scontroller.ph.tank.level = Math.max(msg.extractPayloadByte(20) > 0 ? msg.extractPayloadByte(20) - 1 : msg.extractPayloadByte(20), 0); // values reported as 1-7; possibly 0 if no tank present
        //scontroller.orp.tank.level = Math.max(msg.extractPayloadByte(21) > 0 ? msg.extractPayloadByte(21) - 1 : msg.extractPayloadByte(21), 0); // values reported as 1-7; possibly 0 if no tank present
        //let SIRaw = msg.extractPayloadByte(22);
        //if ((SIRaw & 0x80) === 0x80) {
        //    // negative SI
        //    scontroller.saturationIndex = (256 - SIRaw) / -100;
        //}
        //else {
        //    scontroller.saturationIndex = msg.extractPayloadByte(22) / 100;
        //}
        //controller.calciumHardness = msg.extractPayloadIntBE(23);

        //// scontroller.status2 = msg.extractPayloadByte(25); // remove/unsure?
        //controller.cyanuricAcid = msg.extractPayloadByte(26);
        //controller.alkalinity = msg.extractPayloadIntBE(27);

        //// scontroller.waterFlow = msg.extractPayloadByte(30); // This is probably the temp units.
        //scontroller.ph.probe.tempUnits = 0;//msg.extractPayloadByte(30);  See Above.  This is probably the units.
        //scontroller.ph.probe.temperature = msg.extractPayloadByte(31);

        //msg.extractPayloadByte(33);

        ////   [0, { name: 'dosing', desc: 'Dosing' }],
        ////   [1, { name: 'monitoring', desc: 'Monitoring' }],
        ////   [2, { name: 'mixing', desc: 'Mixing' }]

        //scontroller.ph.dosingStatus = (msg.extractPayloadByte(34) & 0x30) >> 4; // mask 00xx0000 and shift bit 5 & 6
        //scontroller.orp.dosingStatus = (msg.extractPayloadByte(34) & 0xC0) >> 6; // mask xx000000 and shift bit 7 & 8
        //scontroller.ph.flowDelay = scontroller.orp.flowDelay = (msg.extractPayloadByte(35) & 0x02) === 1 ? true : false;
        //scontroller.status = msg.extractPayloadByte(35) & 0x80 >> 7; // to be verified as comms lost
        //scontroller.ph.manualDosing = (msg.extractPayloadByte(35) & 0x08) === 1 ? true : false;
        //controller.orp.useChlorinator = (msg.extractPayloadByte(35) & 0x10) === 1 ? true : false;
        //controller.HMIAdvancedDisplay = (msg.extractPayloadByte(35) & 0x20) === 1 ? true : false;
        //controller.ph.phSupply = (msg.extractPayloadByte(35) & 0x40) === 1 ? true : false; // acid pH dosing = 1; base pH dosing = 0;
        //scontroller.firmware = `${msg.extractPayloadByte(37)}.${msg.extractPayloadByte(36).toString().padStart(3, '0')}`

        //const warnings = scontroller.warnings;
        //warnings.waterChemistry = msg.extractPayloadByte(38);
        //warnings.pHLockout = msg.extractPayloadByte(33) & 0x01;
        //warnings.pHDailyLimitReached = msg.extractPayloadByte(33) & 0x02;
        //warnings.orpDailyLimitReached = msg.extractPayloadByte(33) & 0x04;
        //warnings.invalidSetup = msg.extractPayloadByte(33) & 0x08;
        //warnings.chlorinatorCommError = msg.extractPayloadByte(33) & 0x10;

        //// RKS: This should really match against the body for the chlorinator when *Chem thinks it has been provided TDS.
        //// RG: Byte 35, bit 4 indicates IntelliChlor is used.  Until we know more, this logic suffices.
        //if (sys.chlorinators.length > 0) {
        //    let chlor = state.chlorinators.find(elem => elem.id === 1);
        //    scontroller.orp.probe.saltLevel = (typeof chlor !== 'undefined') ? chlor.saltLevel : msg.extractPayloadByte(29) * 50;
        //}
        //else scontroller.orp.probe.saltLevel = 0;

        //// manually emit extended values
        //webApp.emitToClients('chemController', scontroller.getExtended()); // emit extended data
        //scontroller.hasChanged = false; // try to avoid duplicate emits
        //msg.isProcessed = true;
    }
}