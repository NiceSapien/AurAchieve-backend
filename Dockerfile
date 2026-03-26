# 1. Use Node LTS
FROM node:24-slim

# 2. Create app directory
WORKDIR /app

# 3. Install dependencies
# Copy package files first for better caching
COPY package*.json ./
RUN npm install

# 4. Copy the rest of your code
COPY . .

# 5. Set permissions (Hugging Face runs as user 1000)
RUN chown -R 1000:1000 /app
USER 1000

# 6. Expose the port HF expects
EXPOSE 7860

# 7. Start the app
CMD ["node", "server.js"]