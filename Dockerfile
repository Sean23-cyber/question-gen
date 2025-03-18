FROM node:18

# Install Ollama
RUN curl -fsSL https://ollama.ai/install.sh | sh

# Set up the Node.js app
WORKDIR /app
COPY package.json .
COPY package-lock.json .
RUN npm install
COPY . .

# Expose ports
EXPOSE 8080 11434

# Start Ollama and the Node.js app
CMD ollama run qwen2.5:1.5b & ollama serve & npm start
