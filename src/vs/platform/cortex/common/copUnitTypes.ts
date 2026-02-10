/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * SIDC (Symbol Identification Code) construction helpers for MIL-STD-2525D.
 *
 * A MIL-STD-2525D SIDC is a 20-digit numeric code with this field layout:
 *
 *   Pos 1-2:   Version            (10 = MIL-STD-2525D)
 *   Pos 3-4:   Standard Identity  (context + identity, e.g. 03 = Reality/Friend)
 *   Pos 5-6:   Symbol Set         (10 = Land Unit, 01 = Air, 30 = Sea Surface)
 *   Pos 7:     Status             (0 = Present, 1 = Planned, 3 = Damaged, 4 = Destroyed)
 *   Pos 8:     HQ/TF/Dummy       (0 = None, 2 = HQ, 4 = Task Force)
 *   Pos 9-10:  Echelon/Amplifier  (16 = Battalion, 21 = Division, etc.)
 *   Pos 11-12: Entity
 *   Pos 13-14: Entity Type
 *   Pos 15-16: Entity Subtype
 *   Pos 17-18: Modifier 1
 *   Pos 19-20: Modifier 2
 *
 * Reference: https://docs.carmenta.com/pages/milstd2525d_tactical_sidc.html
 * Verified against ARCHITECTURE.md example: 10031000161211000000 (friendly infantry battalion)
 *
 * The interfaces ICopUnit, ICopUnitProperties, and ICopOrbat are defined in
 * copTypes.ts. This file provides helper functions for SIDC construction only.
 */

import { CopAffiliation, CopEchelon, CopUnitStatus } from './copTypes.js';

// ─── Standard Identity Mapping (Positions 3-4) ───────────────────────────────

/**
 * MIL-STD-2525D Standard Identity (positions 3-4).
 *
 * Format: {context digit}{identity digit}
 *   Context: 0 = Reality, 1 = Exercise, 2 = Simulation
 *   Identity: 0 = Pending, 1 = Unknown, 2 = Assumed Friend, 3 = Friend,
 *             4 = Neutral, 5 = Suspect/Joker, 6 = Hostile/Faker
 *
 * We use context 0 (Reality) for all operational units.
 */
const AFFILIATION_TO_SIDC: Record<CopAffiliation, string> = {
	friendly: '03',
	hostile: '06',
	neutral: '04',
	unknown: '01',
};

// ─── Symbol Set (Positions 5-6) ───────────────────────────────────────────────

/** Land Unit symbol set. All our unit types use this. */
const LAND_UNIT_SYMBOL_SET = '10';

// ─── Status Mapping (Position 7) ──────────────────────────────────────────────

/**
 * MIL-STD-2525D Status digit (position 7).
 *   0 = Present
 *   1 = Planned/Anticipated/Suspect
 *   2 = Present/Fully Capable
 *   3 = Present/Damaged
 *   4 = Present/Destroyed
 *   5 = Present/Full to Capacity
 */
const STATUS_TO_SIDC: Record<CopUnitStatus, string> = {
	present: '0',
	operational: '0',
	fully_capable: '2',
	degraded: '3',
	not_operational: '3',
	destroyed: '4',
	anticipated: '1',
	planned: '1',
};

// ─── HQ/TF/Dummy (Position 8) ────────────────────────────────────────────────

/** Default: 0 = Not applicable (no HQ, TF, or Dummy designation) */
const DEFAULT_HQ_TF_DUMMY = '0';

// ─── Echelon Mapping (Positions 9-10) ─────────────────────────────────────────

/**
 * MIL-STD-2525D Echelon/Amplifier (positions 9-10).
 *
 * First digit: 0 = Unknown, 1 = Echelon brigade and below,
 *              2 = Echelon division and above
 * Second digit: see standard reference.
 */
const ECHELON_TO_SIDC: Record<CopEchelon, string> = {
	team: '11',
	squad: '12',
	section: '13',
	platoon: '14',
	company: '15',
	battalion: '16',
	regiment: '17',
	brigade: '18',
	division: '21',
	corps: '22',
	army: '23',
	army_group: '24',
	theater: '25',
	command: '26',
};

// ─── Entity Code Mapping (Positions 11-16) ────────────────────────────────────

/**
 * Maps unit type strings to MIL-STD-2525D 6-digit entity codes
 * (positions 11-16: Entity + Entity Type + Entity Subtype).
 *
 * These are for Symbol Set 10 (Land Unit) only.
 * The symbol set itself is specified separately as LAND_UNIT_SYMBOL_SET.
 */
const UNIT_TYPE_TO_ENTITY: Record<string, string> = {
	infantry: '121100',          // Land Unit > Infantry
	armor: '120500',             // Land Unit > Armor/Armored
	artillery: '130000',         // Land Unit > Field Artillery
	engineer: '140000',          // Land Unit > Engineer
	logistics: '160000',         // Land Unit > CSS / Logistics
	reconnaissance: '121300',    // Land Unit > Reconnaissance
	aviation: '150000',          // Land Unit > Aviation
	signal: '183200',            // Land Unit > Signal
	medical: '160600',           // Land Unit > Medical
	headquarters: '110000',      // Land Unit > HQ/Command
	air_defense: '130200',       // Land Unit > Air Defense
	chemical: '140300',          // Land Unit > Chemical
	military_police: '111600',   // Land Unit > Military Police
	special_operations: '121600', // Land Unit > Special Operations Forces
	supply: '161300',            // Land Unit > Supply
	maintenance: '160700',       // Land Unit > Maintenance
	transportation: '161400',    // Land Unit > Transportation
	unknown_unit: '000000',      // Land Unit > Unknown
};

// ─── SIDC Builder ─────────────────────────────────────────────────────────────

/**
 * Build a 20-digit MIL-STD-2525D SIDC from high-level unit properties.
 *
 * Example: buildSidc('friendly', 'battalion', 'infantry') = '10031000161211000000'
 *   10  = Version (2525D)
 *   03  = Standard Identity (Reality + Friend)
 *   10  = Symbol Set (Land Unit)
 *   0   = Status (Present)
 *   0   = HQ/TF/Dummy (None)
 *   16  = Echelon (Battalion)
 *   12  = Entity (Ground Unit > Infantry)
 *   11  = Entity Type (Infantry)
 *   00  = Entity Subtype (None)
 *   00  = Modifier 1 (None)
 *   00  = Modifier 2 (None)
 *
 * @param affiliation - Unit affiliation (friendly, hostile, neutral, unknown)
 * @param echelon - Echelon level (team through command)
 * @param unitType - Unit type string (infantry, armor, etc.)
 * @param status - Unit operational status
 * @returns 20-digit SIDC string
 */
export function buildSidc(
	affiliation: CopAffiliation,
	echelon: CopEchelon,
	unitType: string,
	status: CopUnitStatus = 'present',
): string {
	// Positions 1-2: Version
	const version = '10';

	// Positions 3-4: Standard Identity (2 digits)
	const identity = AFFILIATION_TO_SIDC[affiliation] || '01';

	// Positions 5-6: Symbol Set (2 digits)
	const symbolSet = LAND_UNIT_SYMBOL_SET;

	// Position 7: Status (1 digit)
	const statusDigit = STATUS_TO_SIDC[status] || '0';

	// Position 8: HQ/TF/Dummy (1 digit)
	const hqTfDummy = DEFAULT_HQ_TF_DUMMY;

	// Positions 9-10: Echelon/Amplifier (2 digits)
	const echelonDigits = ECHELON_TO_SIDC[echelon] || '00';

	// Positions 11-16: Entity + Entity Type + Entity Subtype (6 digits)
	const entityCode = UNIT_TYPE_TO_ENTITY[unitType] || UNIT_TYPE_TO_ENTITY['unknown_unit'];

	// Positions 17-18: Modifier 1 (2 digits)
	const modifier1 = '00';

	// Positions 19-20: Modifier 2 (2 digits)
	const modifier2 = '00';

	return `${version}${identity}${symbolSet}${statusDigit}${hqTfDummy}${echelonDigits}${entityCode}${modifier1}${modifier2}`;
}

/**
 * Get the affiliation from a MIL-STD-2525D SIDC by reading the Standard
 * Identity digit at position 4 (the identity part of the 2-digit field).
 *
 * Positions 3-4: {context}{identity}
 *   Identity: 1 = Unknown, 2 = Assumed Friend, 3 = Friend,
 *             4 = Neutral, 5 = Suspect, 6 = Hostile
 */
export function getAffiliationFromSidc(sidc: string): CopAffiliation {
	if (sidc.length < 4) {
		return 'unknown';
	}
	const identityDigit = sidc[3]; // Position 4 (0-indexed position 3)
	switch (identityDigit) {
		case '3': return 'friendly';
		case '2': return 'friendly';  // Assumed Friend -> friendly
		case '6': return 'hostile';
		case '5': return 'hostile';   // Suspect/Joker -> hostile
		case '4': return 'neutral';
		case '1': return 'unknown';
		case '0': return 'unknown';   // Pending -> unknown
		default: return 'unknown';
	}
}

/**
 * Get the display color for an affiliation.
 */
export function getAffiliationColor(affiliation: CopAffiliation): string {
	switch (affiliation) {
		case 'friendly': return '#2196f3';  // Blue
		case 'hostile': return '#f44336';    // Red
		case 'neutral': return '#4caf50';    // Green
		case 'unknown': return '#ffeb3b';    // Yellow
	}
}

/**
 * Get a default layer ID for a given affiliation.
 */
export function getDefaultLayerId(affiliation: CopAffiliation): string {
	switch (affiliation) {
		case 'friendly': return 'friendly-orbat';
		case 'hostile': return 'enemy-orbat';
		case 'neutral': return 'annotations';
		case 'unknown': return 'annotations';
	}
}

/**
 * Get all known unit type keys.
 */
export function getUnitTypes(): string[] {
	return Object.keys(UNIT_TYPE_TO_ENTITY);
}

/**
 * Get all echelon values in order from smallest to largest.
 */
export function getEchelonValues(): CopEchelon[] {
	return [
		'team', 'squad', 'section', 'platoon',
		'company', 'battalion', 'regiment', 'brigade',
		'division', 'corps', 'army', 'army_group',
		'theater', 'command',
	];
}

/**
 * Get a human-readable label for an echelon.
 */
export function getEchelonLabel(echelon: CopEchelon): string {
	const labels: Record<CopEchelon, string> = {
		team: 'Team',
		squad: 'Squad',
		section: 'Section',
		platoon: 'Platoon',
		company: 'Company',
		battalion: 'Battalion',
		regiment: 'Regiment',
		brigade: 'Brigade',
		division: 'Division',
		corps: 'Corps',
		army: 'Army',
		army_group: 'Army Group',
		theater: 'Theater',
		command: 'Command',
	};
	return labels[echelon] || echelon;
}

/**
 * Get a human-readable label for a unit type.
 */
export function getUnitTypeLabel(unitType: string): string {
	return unitType
		.split('_')
		.map(word => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}

/**
 * Generate a unique unit ID.
 */
export function generateUnitId(): string {
	return `unit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
