const tintColorLight = '#2f95dc';
const tintColorDark = '#fff';

export default {
  light: {
    text: '#000',
    background: '#fff',
    tint: tintColorLight,
    tabIconDefault: '#ccc',
    tabIconSelected: tintColorLight,
    // Surfaces & inputs (theme-aware so text stays readable in both modes)
    card: '#f5f5f5',
    cardAlt: '#e8e8e8',
    inputBackground: '#fff',
    inputText: '#111',
    border: '#ddd',
    muted: '#666',
    placeholder: '#999',
  },
  dark: {
    text: '#fff',
    background: '#000',
    tint: tintColorDark,
    tabIconDefault: '#ccc',
    tabIconSelected: tintColorDark,
    card: '#1c1c1e',
    cardAlt: '#2c2c2e',
    inputBackground: '#1c1c1e',
    inputText: '#fff',
    border: '#3a3a3c',
    muted: '#aaa',
    placeholder: '#8e8e93',
  },
};
