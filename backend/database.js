import { MongoClient } from "mongodb";

export async function connectDatabase(uri) {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });

  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    return client;
  } catch (error) {
    await client.close();
    throw error;
  }
}
