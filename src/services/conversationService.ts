
"use server";
import { db } from '@/lib/firebase';
import { collection, addDoc, query, where, orderBy, getDocs, serverTimestamp, doc, updateDoc, getDoc, limit } from 'firebase/firestore';
// Remove Timestamp type import if no longer directly used in the interface
// import type { Timestamp } from 'firebase/firestore';

export interface Conversation {
  id: string;
  userId: string;
  summary: string;
  script: string;
  createdAt: number; // Changed from Timestamp to number (milliseconds)
  lastOpenedAt: number; // Changed from Timestamp to number (milliseconds)
}

export async function saveOrUpdateConversation(
  userId: string,
  summary: string,
  script: string,
  conversationIdToUpdate?: string | null
): Promise<string> {
  if (!userId || !summary) {
    throw new Error("User ID and summary are required to save conversation.");
  }

  const userConversationsCol = collection(db, 'users', userId, 'conversations');

  if (conversationIdToUpdate) {
    // Update existing conversation
    const conversationRef = doc(db, 'users', userId, 'conversations', conversationIdToUpdate);
    await updateDoc(conversationRef, {
      script,
      summary, 
      lastOpenedAt: serverTimestamp(),
    });
    return conversationIdToUpdate;
  } else {
    // Check if a conversation with a very similar summary already exists to avoid trivial duplicates
    // For a more robust check, consider normalizing summaries (e.g., lowercase, trim) before comparison
    const q = query(userConversationsCol, where('summary', '==', summary), limit(1));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      // Found existing, update it
      const existingDoc = querySnapshot.docs[0];
      await updateDoc(existingDoc.ref, {
        script,
        lastOpenedAt: serverTimestamp(),
      });
      return existingDoc.id;
    } else {
      // Create new conversation
      const docRef = await addDoc(userConversationsCol, {
        userId,
        summary,
        script,
        createdAt: serverTimestamp(),
        lastOpenedAt: serverTimestamp(),
      });
      return docRef.id;
    }
  }
}

export async function getConversations(userId: string): Promise<Conversation[]> {
  if (!userId) return [];
  const userConversationsCol = collection(db, 'users', userId, 'conversations');
  const q = query(userConversationsCol, orderBy('lastOpenedAt', 'desc'));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(docSnap => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      userId: data.userId,
      summary: data.summary,
      script: data.script,
      // Convert Timestamps to milliseconds
      createdAt: data.createdAt?.toMillis() || Date.now(), // Fallback for safety
      lastOpenedAt: data.lastOpenedAt?.toMillis() || Date.now(), // Fallback for safety
    } as Conversation;
  });
}

export async function updateLastOpened(userId: string, conversationId: string): Promise<void> {
  if (!userId || !conversationId) return;
  const conversationRef = doc(db, 'users', userId, 'conversations', conversationId);
  await updateDoc(conversationRef, {
    lastOpenedAt: serverTimestamp(),
  });
}

export async function getConversationById(userId: string, conversationId: string): Promise<Conversation | null> {
  if (!userId || !conversationId) return null;
  const conversationRef = doc(db, 'users', userId, 'conversations', conversationId);
  const docSnap = await getDoc(conversationRef);
  if (docSnap.exists()) {
    const data = docSnap.data();
    return { 
      id: docSnap.id, 
      userId: data.userId,
      summary: data.summary,
      script: data.script,
      // Convert Timestamps to milliseconds
      createdAt: data.createdAt?.toMillis() || Date.now(), // Fallback for safety
      lastOpenedAt: data.lastOpenedAt?.toMillis() || Date.now(), // Fallback for safety
    } as Conversation;
  }
  return null;
}
