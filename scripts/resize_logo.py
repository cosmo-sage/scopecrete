from PIL import Image
import os

img_dir = r'D:\.openclaw\workspace\img'
out_dir = r'D:\Clay\prod\scopecrete-repo\public'

orig = Image.open(os.path.join(img_dir, 'original_logo.png'))
print(f'Original: {orig.width}x{orig.height} mode={orig.mode}')

# Remove alpha channel and resize to 34x34 for header logo
logo = orig.copy()
logo = logo.resize((34, 34), Image.LANCZOS)
logo_path = os.path.join(out_dir, 'logo-34.png')
logo.save(logo_path, 'PNG')
print(f'Saved logo-34.png ({logo.width}x{logo.height})')

# Favicon: 32x32
favicon = orig.copy()
favicon = favicon.resize((32, 32), Image.LANCZOS)
favicon_path = os.path.join(out_dir, 'favicon.png')
favicon.save(favicon_path, 'PNG')
print(f'Saved favicon.png ({favicon.width}x{favicon.height})')

# Favicon ICO: 16x16, 32x32
ico_16 = orig.copy()
ico_16 = ico_16.resize((16, 16), Image.LANCZOS)
ico_32 = orig.copy()
ico_32 = ico_32.resize((32, 32), Image.LANCZOS)
ico_path = os.path.join(out_dir, 'favicon.ico')
ico_16.save(ico_path, format='ICO', append_images=[ico_32], duration=[0,0], loop=0)
print(f'Saved favicon.ico')

orig.close()
logo.close()
favicon.close()
ico_16.close()
ico_32.close()
print('Done')