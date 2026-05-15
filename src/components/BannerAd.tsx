import React from 'react';
import { TouchableOpacity, Image, Text, View, Linking } from 'react-native';

interface BannerAdProps {
  imageUrl: string;
  linkUrl: string;
  width?: number;
  height?: number;
}

export const BannerAd: React.FC<BannerAdProps> = ({
  imageUrl,
  linkUrl,
  width = 320,
  height = 50,
}) => {
  const handlePress = () => {
    Linking.openURL(linkUrl).catch(() => {});
  };

  return (
    <View style={{ alignItems: 'center', marginVertical: 8 }}>
      <Text style={{ fontSize: 9, color: 'rgba(128,128,128,0.5)', marginBottom: 3, letterSpacing: 0.5 }}>
        Publicidad
      </Text>
      <TouchableOpacity onPress={handlePress} activeOpacity={0.85}>
        <Image
          source={{ uri: imageUrl }}
          style={{ width, height, borderRadius: 6 }}
          resizeMode="cover"
        />
      </TouchableOpacity>
    </View>
  );
};
