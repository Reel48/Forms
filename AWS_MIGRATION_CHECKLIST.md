# AWS Backend Migration Checklist

Use this checklist to track your migration progress from Railway to AWS.

## Pre-Migration

- [ ] AWS account created and verified
- [ ] AWS CLI installed and configured
- [ ] Docker installed (for container builds)
- [ ] All environment variables documented
- [ ] Current Railway deployment tested and working
- [ ] Backup of current configuration

## AWS Setup

- [ ] AWS CLI configured with credentials
- [ ] AWS region selected (e.g., us-east-1)
- [ ] IAM user created with appropriate permissions
- [ ] ECR repository created (for App Runner)
- [ ] Docker image built and tested locally
- [ ] Docker image pushed to ECR

## Backend Deployment

### App Runner Option
- [ ] App Runner service created
- [ ] Environment variables configured
- [ ] Service deployed successfully
- [ ] Service URL obtained
- [ ] Health check endpoint working (`/health`)
- [ ] API docs accessible (`/docs`)

### OR Elastic Beanstalk Option
- [ ] EB CLI installed
- [ ] EB environment initialized
- [ ] Environment variables set
- [ ] Application deployed
- [ ] Environment URL obtained
- [ ] Health check working

## Configuration Updates

- [ ] Frontend API URL updated in Vercel
- [ ] Frontend redeployed with new API URL
- [ ] Stripe webhook URL updated
- [ ] Stripe webhook tested
- [ ] CORS configuration verified
- [ ] All environment variables verified

## Testing

- [ ] API health endpoint tested
- [ ] API documentation accessible
- [ ] Frontend can connect to backend
- [ ] Client CRUD operations tested
- [ ] Quote CRUD operations tested
- [ ] PDF generation tested
- [ ] Stripe invoice creation tested
- [ ] Stripe webhook receives events
- [ ] All error cases tested

## Monitoring & Security

- [ ] CloudWatch logs accessible
- [ ] CloudWatch alarms configured (optional)
- [ ] Cost monitoring set up
- [ ] Billing alerts configured
- [ ] Security groups reviewed
- [ ] Secrets Manager configured (if using)

## Custom Domain (Optional)

- [ ] Domain purchased/configured
- [ ] Route 53 hosted zone created
- [ ] SSL certificate requested
- [ ] Custom domain added to App Runner/EB
- [ ] DNS records configured
- [ ] SSL certificate verified
- [ ] Custom domain tested

## CI/CD (Optional)

- [ ] GitHub Actions workflow created
- [ ] AWS credentials added to GitHub Secrets
- [ ] Auto-deployment tested
- [ ] Deployment notifications configured

## Post-Migration

- [ ] All functionality verified
- [ ] Performance compared to Railway
- [ ] Costs reviewed
- [ ] Documentation updated
- [ ] Team notified of new backend URL
- [ ] Old Railway deployment stopped (after verification)
- [ ] Railway subscription cancelled (if applicable)

## Rollback Plan

- [ ] Previous Railway deployment kept running during migration
- [ ] Rollback procedure documented
- [ ] Quick rollback tested (if needed)

## Notes

- Migration date: ___________
- AWS service used: ___________
- Service URL: ___________
- Issues encountered: ___________
- Resolution: ___________

---

## Quick Reference

**Service URL:** `https://________________.awsapprunner.com`

**Environment Variables:**
- SUPABASE_URL: ✅ Set
- SUPABASE_KEY: ✅ Set
- ALLOWED_ORIGINS: ✅ Set
- STRIPE_SECRET_KEY: ✅ Set
- STRIPE_WEBHOOK_SECRET: ✅ Set

**Frontend Updated:**
- Vercel API URL: ✅ Updated
- Frontend Redeployed: ✅ Done

**Stripe Updated:**
- Webhook URL: ✅ Updated
- Webhook Tested: ✅ Working

