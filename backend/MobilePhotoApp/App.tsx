import React, { useEffect, useState } from 'react';
import { 
  StyleSheet, Text, View, ScrollView, Image, 
  TouchableOpacity, ActivityIndicator, Alert, TextInput,
  Linking, SafeAreaView, Pressable 
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

interface ContactMessage {
  id: number;
  name: string;
  email: string;
  subject: string | null;
  message: string;
  created_at: string;
}

interface GalleryItem {
  id: number;
  image_url: string;
  caption: string;
  location: string;
  created_at: string;
  raw_filename?: string; 
}

export default function App() {
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(true);
  const [uploading, setUploading] = useState<boolean>(false);
  const [savingRow, setSavingRow] = useState<boolean>(false);

  const [uploadedPublicUrl, setUploadedPublicUrl] = useState<string | null>(null);
  const [localPreviewUri, setLocalPreviewUri] = useState<string | null>(null);
  const [caption, setCaption] = useState<string>('');

  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editCaptionText, setEditCaptionText] = useState<string>('');

  // Multi-Selection Tracking States
  const [selectedGalleryIds, setSelectedGalleryIds] = useState<number[]>([]);
  const [selectedMessageIds, setSelectedMessageIds] = useState<number[]>([]);

  const openExternalLink = async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Error', `Cannot open this link: ${url}`);
      }
    } catch (err) {
      Alert.alert('Link Error', 'An error occurred while trying to launch the page.');
    }
  };

  const triggerLocalNotification = async (title: string, body: string) => {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') return;

      await Notifications.scheduleNotificationAsync({
        content: { title, body, sound: true },
        trigger: null,
      });
    } catch (err) {
      console.error('Error triggering notification:', err);
    }
  };

  const fetchData = async () => {
    try {
      setLoadingData(true);
      
      const { data: msgData, error: msgErr } = await supabase
        .from('contact_messages')
        .select('*')
        .order('created_at', { ascending: false });

      const { data: galData, error: galErr } = await supabase
        .from('gallery_items')
        .select('*')
        .order('created_at', { ascending: false });

      if (msgErr) throw msgErr;
      if (galErr) throw galErr;

      if (galData && galData.length > 0) {
        const secureGalleryItems = await Promise.all(
          galData.map(async (item) => {
            const fileName = item.image_url.split('/').pop();
            if (fileName) {
              const { data, error } = await supabase.storage
                .from('images')
                .createSignedUrl(fileName, 900); 

              if (!error && data) {
                return { ...item, image_url: data.signedUrl, raw_filename: fileName };
              }
            }
            return item;
          })
        );
        setGallery(secureGalleryItems);
      } else {
        setGallery([]);
      }

      setMessages(msgData || []);
    } catch (error: any) {
      Alert.alert('Data Sync Error', error.message);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    fetchData();
    Notifications.requestPermissionsAsync();

    const channel = supabase
      .channel('unified-dashboard-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'contact_messages' }, (payload: any) => {
        fetchData();
        triggerLocalNotification(
          'New Inbound Message',
          `${payload.new.name || 'Someone'} sent a message: "${payload.new.message}"`
        );
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'gallery_items' }, (payload: any) => {
        fetchData();
        triggerLocalNotification(
          'Caption Updated',
          `A gallery item was modified to: "${payload.new.caption}"`
        );
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gallery_items' }, (payload: any) => {
        fetchData();
        triggerLocalNotification(
          'New Image Published',
          `Caption: "${payload.new.caption}"`
        );
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'contact_messages' }, () => fetchData())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'gallery_items' }, () => fetchData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const pickAndUploadImageFirst = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission Denied', 'Gallery access is required.');
      return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      try {
        setUploading(true);
        setLocalPreviewUri(result.assets[0].uri);

        const fileExtension = result.assets[0].uri.split('.').pop() || 'jpg';
        const fileName = `gallery_${Date.now()}.${fileExtension}`;

        const { error: storageError } = await supabase.storage
          .from('images')
          .upload(fileName, decode(result.assets[0].base64), {
            contentType: `image/${fileExtension}`,
            upsert: true
          });

        if (storageError) throw storageError;

        const { data: { publicUrl } } = supabase.storage
          .from('images')
          .getPublicUrl(fileName);

        setUploadedPublicUrl(publicUrl);
        Alert.alert('Uploaded', 'Image saved to storage. Enter caption below.');
      } catch (error: any) {
        Alert.alert('Storage Upload Failure', error.message);
        setLocalPreviewUri(null);
      } finally {
        setUploading(false);
      }
    }
  };

  const saveCaptionAndPublish = async () => {
    if (!caption.trim() || !uploadedPublicUrl) return;

    try {
      setSavingRow(true);
      const { error: dbError } = await supabase
        .from('gallery_items')
        .insert([{
          image_url: uploadedPublicUrl,
          caption: caption,
          location: 'Mobile Upload'
        }]);

      if (dbError) throw dbError;

      setCaption('');
      setUploadedPublicUrl(null);
      setLocalPreviewUri(null);
    } catch (error: any) {
      Alert.alert('Database Save Failure', error.message);
    } finally {
      setSavingRow(false);
    }
  };

  const updateCaption = async (id: number) => {
    if (!editCaptionText.trim()) {
      Alert.alert('Error', 'Caption cannot be left empty.');
      return;
    }
    try {
      const { error } = await supabase
        .from('gallery_items')
        .update({ caption: editCaptionText })
        .eq('id', id);

      if (error) throw error;
      setEditingItemId(null);
      setEditCaptionText('');
    } catch (error: any) {
      Alert.alert('Update Failed', error.message);
    }
  };

  // Gallery Item Select Operations
  const handleGalleryPress = (id: number) => {
    if (selectedGalleryIds.length > 0) {
      toggleGallerySelection(id);
    }
  };

  const toggleGallerySelection = (id: number) => {
    setSelectedGalleryIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const deleteSelectedGalleryItems = () => {
    if (selectedGalleryIds.length === 0) return;
    Alert.alert('Delete Selected Images', `Are you sure you want to permanently delete ${selectedGalleryIds.length} selected images?`, [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Delete All', 
        style: 'destructive',
        onPress: async () => {
          try {
            for (const id of selectedGalleryIds) {
              const item = gallery.find(g => g.id === id);
              await supabase.from('gallery_items').delete().eq('id', id);
              if (item?.raw_filename) {
                await supabase.storage.from('images').remove([item.raw_filename]);
              }
            }
            setSelectedGalleryIds([]);
          } catch (error: any) {
            Alert.alert('Delete Failed', error.message);
          }
        }
      }
    ]);
  };

  // Message Card Select Operations
  const handleMessagePress = (id: number) => {
    if (selectedMessageIds.length > 0) {
      toggleMessageSelection(id);
    }
  };

  const toggleMessageSelection = (id: number) => {
    setSelectedMessageIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const deleteSelectedMessages = () => {
    if (selectedMessageIds.length === 0) return;
    Alert.alert('Delete Selected Messages', `Are you sure you want to remove ${selectedMessageIds.length} selected messages?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete All',
        style: 'destructive',
        onPress: async () => {
          try {
            await supabase.from('contact_messages').delete().in('id', selectedMessageIds);
            setSelectedMessageIds([]);
          } catch (error: any) {
            Alert.alert('Delete Failed', error.message);
          }
        }
      }
    ]);
  };

  return (
    <SafeAreaView style={styles.windowWrapper}>
      {/* ATTRACTIVE APP NAVIGATION HEADER BAR */}
      <View style={styles.navBar}>
        <Text style={styles.navTitle}>purnaWebsite</Text>
        
        <View style={styles.navLinksRow}>
          <TouchableOpacity 
            style={styles.navLinkButton} 
            onPress={() => openExternalLink('https://purnaprasadacharya.com.np')}
          >
            <Text style={styles.navLinkText}>Your Website</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.navLinkButton, styles.fbButtonActive]} 
            onPress={() => openExternalLink('https://www.facebook.com/purna.acharya.2025?rdid=2f7WjGrA1i3MrOXM&share_url=https%3A%2F%2Fwww.facebook.com%2Fshare%2F1973BSqtWD%2F#')}
          >
            <Image 
              source={require('./assets/facebook.png')} 
              style={styles.fbLogo} 
            />
            <Text style={[styles.navLinkText, styles.fbText]}>Facebook</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.navLinkButton} 
            onPress={() => openExternalLink('https://acharyabridhauddhyam.com.np/')}
          >
            <Text style={styles.navLinkText}>पर्यटन परियोजना</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.mainContainer} contentContainerStyle={{ paddingBottom: 40 }}>
        
        {/* EXHIBITION GALLERY SECTION */}
        <View style={styles.cardSection}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeader}>Exhibition Gallery ({gallery.length})</Text>
            {selectedGalleryIds.length > 0 && (
              <TouchableOpacity style={styles.batchDeleteBtn} onPress={deleteSelectedGalleryItems}>
                <Text style={styles.batchDeleteText}>Delete ({selectedGalleryIds.length})</Text>
              </TouchableOpacity>
            )}
          </View>
          
          <TouchableOpacity 
            style={[styles.primaryButton, uploading && styles.disabledButton]} 
            onPress={pickAndUploadImageFirst}
            disabled={uploading || savingRow}
          >
            <Text style={styles.buttonText}>1. Pick and Upload Image First</Text>
          </TouchableOpacity>

          {localPreviewUri && (
            <View style={styles.previewContainer}>
              <Image source={{ uri: localPreviewUri }} style={styles.previewImage} />
            </View>
          )}

          {uploadedPublicUrl && (
            <View style={styles.captionFormSection}>
              <Text style={styles.inputLabel}>Image Uploaded Successful. Enter Caption:</Text>
              <TextInput
                style={styles.inputField}
                placeholder="Type your caption here..."
                value={caption}
                onChangeText={setCaption}
                placeholderTextColor="#888"
              />
              <TouchableOpacity style={styles.saveButton} onPress={saveCaptionAndPublish}>
                <Text style={styles.buttonText}>2. Save Caption and Publish Post</Text>
              </TouchableOpacity>
            </View>
          )}

          {editingItemId && (
            <View style={styles.editFormBox}>
              <Text style={styles.editLabel}>Edit Caption Mode:</Text>
              <TextInput
                style={styles.inputField}
                value={editCaptionText}
                onChangeText={setEditCaptionText}
                placeholder="Update selected text..."
              />
              <View style={styles.rowActions}>
                <TouchableOpacity style={styles.saveInlineBtn} onPress={() => updateCaption(editingItemId)}>
                  <Text style={styles.miniBtnText}>Update</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelInlineBtn} onPress={() => setEditingItemId(null)}>
                  <Text style={styles.miniBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <Text style={styles.subSectionTitle}>Active Cards (Hold item card to multi-select)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
            {gallery.map((item) => {
              const isSelected = selectedGalleryIds.includes(item.id);
              return (
                <Pressable 
                  key={item.id} 
                  onPress={() => handleGalleryPress(item.id)}
                  onLongPress={() => toggleGallerySelection(item.id)}
                  style={[styles.galleryCard, isSelected && styles.selectedItemCard]}
                >
                  <Image source={{ uri: item.image_url }} style={styles.galleryImage} />
                  {isSelected && <View style={styles.selectionOverlayTick} />}
                  <View style={styles.galleryMeta}>
                    <Text style={styles.galleryCaption} numberOfLines={1}>{item.caption}</Text>
                    <View style={styles.galleryManagementRow}>
                      <TouchableOpacity 
                        onPress={() => {
                          setEditingItemId(item.id);
                          setEditCaptionText(item.caption);
                        }}
                      >
                        <Text style={styles.editLinkText}>Edit</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* INBOUND MESSAGES FEED */}
        <View style={styles.cardSection}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeader}>Inbound Form Messages ({messages.length})</Text>
            {selectedMessageIds.length > 0 && (
              <TouchableOpacity style={styles.batchDeleteBtn} onPress={deleteSelectedMessages}>
                <Text style={styles.batchDeleteText}>Delete ({selectedMessageIds.length})</Text>
              </TouchableOpacity>
            )}
          </View>
          
          {loadingData ? (
            <ActivityIndicator size="small" color="#3ecf8e" style={{ marginVertical: 20 }} />
          ) : messages.length === 0 ? (
            <Text style={styles.emptyStateText}>No messages received via website contact form yet.</Text>
          ) : (
            messages.map((msg) => {
              const isSelected = selectedMessageIds.includes(msg.id);
              return (
                <Pressable 
                  key={msg.id} 
                  onPress={() => handleMessagePress(msg.id)}
                  onLongPress={() => toggleMessageSelection(msg.id)}
                  style={[styles.messageCard, isSelected && styles.selectedItemCard]}
                >
                  <View style={styles.msgHeader}>
                    <Text style={styles.msgSender}>{msg.name}</Text>
                    {isSelected && <Text style={styles.selectedIndicatorText}>Selected</Text>}
                  </View>
                  <Text style={styles.msgEmail}>{msg.email}</Text>
                  {msg.subject && <Text style={styles.msgSubject}>Sub: {msg.subject}</Text>}
                  <Text style={styles.msgBody}>{msg.message}</Text>
                  <Text style={styles.msgTimestamp}>{new Date(msg.created_at).toLocaleString()}</Text>
                </Pressable>
              );
            })
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  windowWrapper: { flex: 1, backgroundColor: '#f4f6f9' },
  
  // BEAUTIFUL ATTRACTIVE FLOATING NAVBAR
  navBar: { 
    backgroundColor: '#1a1a1e', 
    paddingVertical: 18, 
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: '#2c2c32',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5
  },
  navTitle: { color: '#ffffff', fontSize: 22, fontWeight: '900', letterSpacing: 0.8, marginBottom: 14, fontFamily: 'System' },
  navLinksRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, justifyContent: 'center', width: '100%' },
  navLinkButton: { 
    backgroundColor: '#252529', 
    paddingVertical: 8, 
    paddingHorizontal: 12, 
    borderRadius: 20, 
    borderWidth: 1, 
    borderColor: '#333339',
    alignItems: 'center',
    justifyContent: 'center'
  },
  fbButtonActive: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 6, 
    backgroundColor: '#1877f2', 
    borderColor: '#166fe5' 
  },
  fbLogo: { width: 14, height: 14, resizeMode: 'contain', tintColor: '#ffffff' },
  navLinkText: { color: '#e1e1e6', fontSize: 12, fontWeight: '700' },
  fbText: { color: '#ffffff' },

  mainContainer: { flex: 1, padding: 16 },
  cardSection: { backgroundColor: '#ffffff', borderRadius: 16, padding: 16, marginBottom: 20, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', paddingBottom: 10 },
  sectionHeader: { fontSize: 16, fontWeight: '700', color: '#1c1c1e' },
  
  // BATCH ACTIONS CONTROLS
  batchDeleteBtn: { backgroundColor: '#eb5757', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8 },
  batchDeleteText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  selectedIndicatorText: { color: '#2f80ed', fontSize: 11, fontWeight: '700' },
  
  subSectionTitle: { fontSize: 12, fontWeight: '600', color: '#8e8e93', marginTop: 20, marginBottom: 10 },
  previewContainer: { marginTop: 12, alignItems: 'center' },
  previewImage: { width: '100%', height: 150, borderRadius: 8, backgroundColor: '#eaeaea' },
  captionFormSection: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#2e7d32', marginBottom: 8 },
  inputField: { backgroundColor: '#f4f5f7', borderWidth: 1, borderColor: '#e4e6eb', borderRadius: 8, padding: 12, fontSize: 14, color: '#1c1c1e', marginBottom: 12 },
  primaryButton: { backgroundColor: '#2f80ed', paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  saveButton: { backgroundColor: '#3ecf8e', paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  disabledButton: { backgroundColor: '#a3e7c9' },
  buttonText: { color: '#ffffff', fontWeight: '700', fontSize: 15 },
  horizontalScroll: { flexDirection: 'row', marginTop: 8 },
  
  // SELECTION MODIFIERS
  galleryCard: { width: 160, marginRight: 14, backgroundColor: '#f8f9fa', borderRadius: 10, overflow: 'hidden', borderWidth: 2, borderColor: '#e4e6eb', position: 'relative' },
  selectedItemCard: { borderColor: '#2f80ed', backgroundColor: '#f0f6ff' },
  selectionOverlayTick: { position: 'absolute', top: 8, right: 8, width: 18, height: 18, borderRadius: 9, backgroundColor: '#2f80ed', borderOpacity: 1, zIndex: 3 },
  
  galleryImage: { width: '100%', height: 110, resizeMode: 'cover' },
  galleryMeta: { padding: 8 },
  galleryCaption: { fontSize: 12, fontWeight: '600', color: '#1c1c1e', marginBottom: 4 },
  galleryManagementRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: '#eaeaea' },
  editLinkText: { fontSize: 11, color: '#2f80ed', fontWeight: '600' },
  editFormBox: { marginVertical: 12, padding: 12, backgroundColor: '#fff9c4', borderRadius: 8, borderWidth: 1, borderColor: '#fff59d' },
  editLabel: { fontSize: 12, fontWeight: '700', color: '#f57f17', marginBottom: 6 },
  rowActions: { flexDirection: 'row', gap: 10 },
  saveInlineBtn: { backgroundColor: '#f2994a', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 4 },
  cancelInlineBtn: { backgroundColor: '#7f8c8d', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 4 },
  miniBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  emptyStateText: { textAlign: 'center', color: '#999', paddingVertical: 20, fontSize: 13 },
  
  messageCard: { backgroundColor: '#f8f9fa', borderRadius: 10, padding: 14, marginBottom: 12, borderWidth: 2, borderColor: '#e4e6eb' },
  msgHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  msgSender: { fontSize: 14, fontWeight: '700', color: '#1c1c1e' },
  msgEmail: { fontSize: 11, color: '#666', marginBottom: 4 },
  msgSubject: { fontSize: 12, fontWeight: '600', color: '#555', marginBottom: 4, fontStyle: 'italic' },
  msgBody: { fontSize: 13, color: '#333', lineHeight: 18 },
  msgTimestamp: { fontSize: 9, color: '#aaa', marginTop: 8, textAlign: 'right' }
});