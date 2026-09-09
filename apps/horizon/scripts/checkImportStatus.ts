#!/usr/bin/env ts-node

/**
 * Test Script for Schema Processing
 * 
 * This script tests the basic functionality of schema processing
 * by processing just one schema from one category.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { SorobanSchemaEncoder, StellarDataType, StellarSchemaDefinition } from '@signetprotocol/stellar-sdk';
import { getDB } from '../src/common/db';
import schemaValues from './writeSchemaEntries';

interface SchemaEntry {
  name: string;
  uid: string;
  category: string;
}

async function testDatabaseConnection() {
  console.log('🔍 Testing database connection...');
  try {
    const db = await getDB();
    if (!db) {
      console.error('❌ Database connection failed');
      return false;
    }
    
    // Test a simple query
    const schemaCount = await db.schema.count();
    console.log(`✅ Database connected. Found ${schemaCount} schemas in database`);
    return true;
  } catch (error) {
    console.error('❌ Database connection error:', error);
    return false;
  }
}

async function testSchemaMatching() {
  console.log('\n🔍 Testing schema matching...');
  
  try {
    // Read one JSONL file
    const filePath = join(__dirname, 'schemas-identity.jsonl');
    const fileContent = readFileSync(filePath, 'utf-8');
    const lines = fileContent.trim().split('\n');
    const firstSchema: SchemaEntry = JSON.parse(lines[0]);
    
    console.log(`📄 Testing with schema: ${firstSchema.name}`);
    console.log(`🆔 Schema UID: ${firstSchema.uid}`);
    console.log(`📂 Category: ${firstSchema.category}`);
    
    // Check if schema value exists
    if (firstSchema.name in schemaValues) {
      const schemaValue = schemaValues[firstSchema.name as keyof typeof schemaValues];
      console.log(`✅ Schema value found:`, JSON.stringify(schemaValue, null, 2));
      return true;
    } else {
      console.error(`❌ Schema value not found for: ${firstSchema.name}`);
      return false;
    }
  } catch (error) {
    console.error('❌ Schema matching test failed:', error);
    return false;
  }
}

async function testSchemaLookup() {
  console.log('\n🔍 Testing database schema lookup...');
  
  try {
    const db = await getDB();
    if (!db) {
      console.error('❌ Database not available');
      return false;
    }
    
    // Read one JSONL file to get a schema UID
    const filePath = join(__dirname, 'schemas-identity.jsonl');
    const fileContent = readFileSync(filePath, 'utf-8');
    const lines = fileContent.trim().split('\n');
    const firstSchema: SchemaEntry = JSON.parse(lines[0]);
    
    // Look up the schema in the database
    const dbSchema = await db.schema.findUnique({
      where: { uid: firstSchema.uid }
    });
    
    if (dbSchema) {
      console.log(`✅ Schema found in database:`);
      console.log(`   Name: ${dbSchema.parsedSchemaDefinition ? JSON.parse(dbSchema.schemaDefinition).name : 'Unknown'}`);
      console.log(`   Current category: ${dbSchema.category}`);
      console.log(`   Current type: ${dbSchema.type}`);
      return true;
    } else {
      console.log(`⚠️  Schema ${firstSchema.uid} not found in database`);
      console.log(`   This might be expected if schemas haven't been indexed yet`);
      return true; // Not necessarily an error
    }
  } catch (error) {
    console.error('❌ Database schema lookup failed:', error);
    return false;
  }
}

async function main() {

  const schema: StellarSchemaDefinition = {
    name: 'test',
    description: 'test',
    fields: [
      { name: 'test', type: StellarDataType.STRING }
    ]
  }

  const encoder = new SorobanSchemaEncoder(schema);

  console.log({
    schemaXDR: encoder.toXDR(),
    schemaJSON: encoder.toJSONSchema(),
    schemaHash: encoder.getSchemaHash(),
    schema: encoder.getSchema(),
    schemaEncoded: encoder.encodeData({ test: 'test' }),
  });

  console.log('🧪 Schema Processing Test Suite\n');
  
  const tests = [
    { name: 'Database Connection', fn: testDatabaseConnection },
    { name: 'Schema Matching', fn: testSchemaMatching },
    { name: 'Database Schema Lookup', fn: testSchemaLookup }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`🧪 Running: ${test.name}`);
    console.log('='.repeat(50));
    
    try {
      const result = await test.fn();
      if (result) {
        console.log(`✅ ${test.name}: PASSED`);
        passed++;
      } else {
        console.log(`❌ ${test.name}: FAILED`);
        failed++;
      }
    } catch (error) {
      console.error(`❌ ${test.name}: ERROR -`, error);
      failed++;
    }
  }
  
  console.log(`\n${'='.repeat(50)}`);
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(50));
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total: ${tests.length}`);
  
  if (failed === 0) {
    console.log('\n🎉 All tests passed! Ready to run the full processing script.');
  } else {
    console.log('\n⚠️  Some tests failed. Please check the configuration before running the full script.');
  }
}

if (require.main === module) {
  main().catch(console.error);
} 