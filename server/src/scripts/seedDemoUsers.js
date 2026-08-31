/**
 * seedDemoUsers.js
 *
 * Idempotent seed script to provision predefined demonstration accounts and sample fields.
 * Conforms to SIH demo requirements for Farmer, Expert, Officer, and Admin roles.
 *
 * Security Invariant: Passwords MUST be provided via environment variables.
 * Fails fast if any required demo password environment variable is absent.
 */

'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const { User, USER_ROLES } = require('../models/User');
const { Field } = require('../models/Field');
const { hashPassword } = require('../services/authService');

const REQUIRED_ENV_VARS = [
  { key: 'DEMO_FARMER_PASSWORD', role: USER_ROLES.FARMER, name: 'Ramesh Demo Farmer', email: 'farmer.demo@crophealth.local' },
  { key: 'DEMO_EXPERT_PASSWORD', role: USER_ROLES.EXPERT, name: 'Dr. Sunita Agronomist', email: 'expert.demo@crophealth.local' },
  { key: 'DEMO_OFFICER_PASSWORD', role: USER_ROLES.OFFICER, name: 'Inspector Rajesh Rao', email: 'officer.demo@crophealth.local' },
  { key: 'DEMO_ADMIN_PASSWORD', role: USER_ROLES.ADMIN, name: 'Platform Administrator', email: 'admin.demo@crophealth.local' },
];

async function seedDemoUsers() {
  // 1. Validate required environment variables
  const missing = REQUIRED_ENV_VARS.filter(item => !process.env[item.key] || process.env[item.key].trim() === '');
  if (missing.length > 0) {
    console.error('\n============================================================');
    console.error('[ERROR] Missing required demo password environment variable(s):');
    missing.forEach(m => console.error(`  - ${m.key} (for ${m.role} account: ${m.email})`));
    console.error('\nPlease define these variables in server/.env before running the seed script.');
    console.error('============================================================\n');
    throw new Error(`Missing required demo password environment variables: ${missing.map(m => m.key).join(', ')}`);
  }

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('Missing MONGODB_URI in environment configuration.');
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB.\n');

  console.log('============================================================');
  console.log('SEEDING SIH DEMO ACCOUNTS');
  console.log('============================================================');

  let farmerUser = null;

  for (const item of REQUIRED_ENV_VARS) {
    const rawPassword = process.env[item.key];
    const passwordHash = await hashPassword(rawPassword);

    const updateData = {
      name: item.name,
      passwordHash,
      role: item.role,
      language: 'en',
      district: 'Pune',
      state: 'Maharashtra',
      location: {
        type: 'Point',
        coordinates: [73.8567, 18.5204],
      },
      isActive: true,
    };

    const updated = await User.findOneAndUpdate(
      { email: item.email },
      { $set: updateData },
      { upsert: true, returnDocument: 'after' }
    );

    if (item.role === USER_ROLES.FARMER) {
      farmerUser = updated;
    }

    console.log(`[OK] Provisioned Role: ${item.role.toUpperCase().padEnd(8)} | Email: ${item.email}`);
  }

  // 2. Seed neutral sample fields for the demo farmer
  if (farmerUser) {
    console.log('\n------------------------------------------------------------');
    console.log('SEEDING DEMO FARMER FIELDS');
    console.log('------------------------------------------------------------');

    const demoFields = [
      {
        userId: farmerUser._id,
        name: 'Demo Tomato Field',
        crop: 'tomato',
        variety: 'Pusa Ruby',
        growthStage: 'flowering',
        area: { value: 2.5, unit: 'acre' },
        location: {
          type: 'Point',
          coordinates: [73.8567, 18.5204],
        },
        notes: 'Drip irrigated demo plot, clay loam soil.',
        isActive: true,
      },
      {
        userId: farmerUser._id,
        name: 'Demo Potato Field',
        crop: 'potato',
        variety: 'Kufri Jyoti',
        growthStage: 'vegetative',
        area: { value: 1.8, unit: 'acre' },
        location: {
          type: 'Point',
          coordinates: [73.8600, 18.5250],
        },
        notes: 'Sprinkler irrigated demo plot.',
        isActive: true,
      },
    ];

    for (const f of demoFields) {
      const fieldDoc = await Field.findOneAndUpdate(
        { userId: f.userId, name: f.name },
        { $set: f },
        { upsert: true, returnDocument: 'after' }
      );
      console.log(`[OK] Field: "${fieldDoc.name}" | Crop: ${fieldDoc.crop} | ID: ${fieldDoc._id}`);
    }
  }

  console.log('============================================================');
  console.log('DEMO ACCOUNTS & SAMPLE FIELDS SEEDED SUCCESSFULLY!');
  console.log('============================================================\n');

  await mongoose.disconnect();
}

if (require.main === module) {
  seedDemoUsers()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}

module.exports = seedDemoUsers;
