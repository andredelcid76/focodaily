import * as React from 'react'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'

interface CollaborationNoticeEmailProps {
  siteName: string
  title: string
  body: string
  ctaLabel: string
  ctaUrl: string
  footer?: string
}

export const CollaborationNoticeEmail = ({
  siteName,
  title,
  body,
  ctaLabel,
  ctaUrl,
  footer,
}: CollaborationNoticeEmailProps) => (
  <Html lang="pt-BR">
    <Head />
    <Preview>{title}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={eyebrow}>{siteName}</Text>
        <Heading style={heading}>{title}</Heading>
        <Text style={paragraph}>{body}</Text>

        <Section style={actions}>
          <Button href={ctaUrl} style={button}>
            {ctaLabel}
          </Button>
        </Section>

        <Text style={footerText}>
          {footer ?? 'Se você não estava esperando esta mensagem, pode ignorá-la com segurança.'}
        </Text>
      </Container>
    </Body>
  </Html>
)

export default CollaborationNoticeEmail

const main = {
  backgroundColor: '#f5f5f7',
  fontFamily: 'Arial, sans-serif',
  margin: 0,
  padding: '24px 0',
}

const container = {
  backgroundColor: '#ffffff',
  borderRadius: '12px',
  margin: '0 auto',
  maxWidth: '560px',
  padding: '32px',
}

const eyebrow = {
  color: '#6b7280',
  fontSize: '12px',
  margin: '0 0 12px',
  textTransform: 'uppercase' as const,
}

const heading = {
  color: '#111827',
  fontSize: '24px',
  fontWeight: '700',
  margin: '0 0 16px',
}

const paragraph = {
  color: '#4b5563',
  fontSize: '15px',
  lineHeight: '1.6',
  margin: '0 0 24px',
}

const actions = {
  margin: '0 0 24px',
}

const button = {
  backgroundColor: '#111827',
  borderRadius: '10px',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: '600',
  padding: '12px 18px',
  textDecoration: 'none',
}

const footerText = {
  color: '#9ca3af',
  fontSize: '12px',
  lineHeight: '1.5',
  margin: 0,
}