
"use server";
import { db } from '@/lib/firebase';
import { collection, addDoc, query, where, orderBy, getDocs, serverTimestamp, doc, updateDoc, getDoc, limit } from 'firebase/firestore';

export interface Conversation {
  id: string;
  userId: string;
  summary: string;
  script: string;
  fullConversation: string; // Added field for the full conversation text
  createdAt: number; 
  lastOpenedAt: number; 
}

export async function saveOrUpdateConversation(
  userId: string,
  summary: string,
  script: string,
  fullConversationText: string, // New parameter
  conversationIdToUpdate?: string | null
): Promise<string> {
  if (!userId || !summary) {
    throw new Error("User ID and summary are required to save conversation.");
  }

  const userConversationsCol = collection(db, 'users', userId, 'conversations');
  const dataToSave = {
    userId,
    summary,
    script,
    fullConversation: fullConversationText, // Save the full conversation
    lastOpenedAt: serverTimestamp(),
  };

  if (conversationIdToUpdate) {
    // Update existing conversation
    const conversationRef = doc(db, 'users', userId, 'conversations', conversationIdToUpdate);
    await updateDoc(conversationRef, dataToSave);
    return conversationIdToUpdate;
  } else {
    // Check if a conversation with a very similar summary already exists to avoid trivial duplicates
    const q = query(userConversationsCol, where('summary', '==', summary), limit(1));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      // Found existing, update it
      const existingDoc = querySnapshot.docs[0];
      await updateDoc(existingDoc.ref, dataToSave);
      return existingDoc.id;
    } else {
      // Create new conversation
      const docRef = await addDoc(userConversationsCol, {
        ...dataToSave,
        createdAt: serverTimestamp(), // Only set createdAt for new conversations
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
      fullConversation: data.fullConversation || data.summary || '', // Fallback for older data
      createdAt: data.createdAt?.toMillis() || Date.now(), 
      lastOpenedAt: data.lastOpenedAt?.toMillis() || Date.now(), 
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
      fullConversation: data.fullConversation || data.summary || '', // Fallback for older data
      createdAt: data.createdAt?.toMillis() || Date.now(), 
      lastOpenedAt: data.lastOpenedAt?.toMillis() || Date.now(), 
    } as Conversation;
  }
  return null;
}
